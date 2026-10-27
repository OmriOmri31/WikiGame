# Testing

Every pull request into `test` or `main`, and every push to them, runs the **CI** workflow
(`.github/workflows/ci.yml`). It does not matter who wrote the code or how it was pushed.
Both branches require the **CI passed** check, so a single failing test blocks the merge.

CI uses no secrets. Firebase runs on local emulators with a demo project. Wikipedia is mocked.
Nothing in CI writes to the real Firestore.

## What CI checks

| Job | What it checks |
| --- | --- |
| Unit tests (web) | `web/tests`: article fetching, Google names, nicknames, share text, and that the CSP hash matches the theme script in `index.html`. |
| Firestore rules tests | `rules-tests`: every rule in `firestore.rules`, run on the Firestore emulator. At least 168 tests must run, and none may fail. |
| Build, production guards, bundle size, audit | Lockfiles match `package.json`. The production build (what Netlify builds) must pass four checks. First, it holds no test-site code: no five-tap secret code prompt, no test admin, no test desk, no TEST branding and no emulator wiring. Second, the `netlify.toml` security headers are in place, and the CSP hash matches the built page. Third, the bundle is within its size budget. Fourth, it holds no secrets. A test-site build made with fake values must contain the markers, so the guard is known to work. `npm audit` fails on high or critical advisories (see below). |
| Secret scan and repo checks | gitleaks over the whole git history. A custom scan for API keys, tokens, private keys, personal emails, committed `.env` files and desk-shaped paths. Hebrew/RTL sanity: `lang="he" dir="rtl"`, and no broken encoding. Workflow files are checked with actionlint. |
| E2E (desktop) and E2E (iphone) | Playwright on the built app, on desktop Chrome and on an iPhone 13 (WebKit). This covers every screen and button: home, the theme toggle, how to play, the intro, email sign-in, the daily game (links, back, goal sheet, find in page, menu, give up, resume after reload, end screen), the free game (win, fastest route, play again, give up), the leaderboard (the daily table, yesterday's fastest route, the path dialog, share and copy, play again and share only on your own rows), sign-in and sign-out with an email account, the info pages and the report link. It also covers Wikipedia failing, stalling or missing an article (the retry message appears and links keep working). Every test fails if the page calls the real Firebase project or any unmocked outside host. Desktop also checks no console errors, no horizontal scroll, loading-time budgets, that five taps do not open the secret prompt, that `/admin` and desk-shaped addresses stay closed to players, and the served security headers. |
| CI passed | Passes only when every job above passed. This is the required check. |
| Live smoke (information only) | Read-only: the real Firestore `daily/articles` and Hebrew Wikipedia answer. It is not required, so a Google or Wikipedia outage does not block merges. |

## Run it locally

Use Node 22. The rules and e2e tests need Java 21 or newer for the Firebase emulators.

```sh
# Unit tests
cd web && npm ci && npm test

# Firestore rules tests (emulator)
cd rules-tests && npm ci && npm test

# Production build and its checks
cd web && npm run build && cd ..
node scripts/ci/check-build.mjs prod web/dist
node scripts/ci/check-secrets.mjs web/dist
node scripts/ci/check-hebrew.mjs
node scripts/ci/check-lockfiles.mjs
node scripts/ci/audit.mjs web --omit=dev

# Test-site build with fake values (the guard sanity check)
cd web && WIKIGAME_ENV=test WIKIGAME_SECRET_CODE=ci-fake-secret-code \
  WIKIGAME_TEST_ADMIN_UID=ci-fake-admin-uid \
  WIKIGAME_TEST_DESK_PATH=m-ci-fake-desk-path-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  npx vite build --outDir /tmp/dist-testsite --emptyOutDir && cd ..
node scripts/ci/check-build.mjs testsite /tmp/dist-testsite

# End-to-end (Playwright with the Firestore and Auth emulators)
cd e2e && npm ci && npx playwright install --with-deps chromium webkit
npm run build                      # production build wired to the local emulators, in web/dist-e2e
npm test                           # both desktop and iphone
npm test -- --project=desktop      # one project
npm test -- tests/game.spec.mjs -g "free game"   # one file or test
npx playwright show-report         # after a failure
```

### The test site's secret code

The secret-code check is **local only**. The real code is never stored in the repo or in CI,
and neither is its hash: a short code's hash can be brute-forced, and the repo is public. To check
that the code has not leaked into the repo or a build, point the scan at a file that holds it:

```sh
SECRET_CODE_FILE=/path/to/secret-code.txt node scripts/ci/check-secrets.mjs web/dist
```

The script reads the file, compares in memory and never prints the code.

In CI the e2e jobs run inside Playwright's official image (`mcr.microsoft.com/playwright`), which
already has the browsers. When you upgrade `@playwright/test` in `e2e/`, update the image tag in `ci.yml` too.
CI fails with a reminder if the two don't match.

## How the e2e tests stay safe

- `npm run build` in `e2e/` sets `WIKIGAME_E2E=1`. This points Firebase at `127.0.0.1` emulators with the
  `demo-wikiwiki` project. The flag only works outside Netlify and outside test-site builds
  (`vite.config.js` refuses otherwise), and the production check fails if any emulator wiring reaches `web/dist`.
- `e2e/emulator.mjs` seeds the emulators once per run with a daily pair, an email player and
  a few scores. The tests only read that data, so they can run in parallel.
- `e2e/wiki-mock.mjs` serves a small Hebrew article graph instead of Wikipedia.
- `e2e/serve.mjs` serves the build with the real `netlify.toml` headers, so the CSP applies in tests.

## Budgets

| Budget | Limit | Now (Oct 2026) |
| --- | --- | --- |
| JS loaded by the first page (gzip) | 340 KB | ~264 KB |
| All JS (gzip) | 400 KB | ~305 KB |
| CSS (gzip) | 22 KB | ~14 KB |
| Largest JS file (raw) | 700 KB | ~482 KB |
| Whole `dist` folder | 4 MB | ~2.5 MB |
| First paint (local, mocked network) | 2.5 s | ~0.1 s |
| Home ready to play | 3 s | ~0.2 s |
| Daily game first article | 3 s | ~0.9 s |

Bundle budgets live in `scripts/ci/check-build.mjs`, and time budgets in `e2e/tests/performance.spec.mjs`.
If a change goes over a budget on purpose, raise the budget in the same pull request.

## npm audit exceptions

`scripts/ci/audit-allowlist.json` lists advisories that are allowed, each with a reason. Today it has one:
the gRPC server advisory in `@grpc/grpc-js`, which Firebase uses only under Node. The build check fails if
gRPC ever reaches the browser bundle. `rules-tests` is test tooling that never ships, so its audit only reports.
