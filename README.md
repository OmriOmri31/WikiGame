# WikiWiki

A Hebrew Wikipedia game: get from one article to another using only the links inside the pages.
Play it at https://omri-wiki-game.netlify.app.

## Layout

- `web/` – the site (React + Vite) and its Netlify functions (`web/netlify/functions`).
- `firestore.rules` – Firestore security rules, tested in `rules-tests/`.
- `.github/workflows/` – rules deploys and the daily lottery (both run for real only from `main`).

## Running your own copy

1. Create a Firebase project with Authentication (Email/Password, Google) and Firestore, and put
   its web config in `web/src/firebase.js`. Add your site's domain under Authentication >
   Settings > Authorized domains.
2. `cd web && npm ci && npm run dev` runs it locally. `npm test` runs the unit tests.
3. Rules tests: `cd rules-tests && npm install && npm test` (needs Java 11+).
4. Deploy on Netlify with this repo as the source. `netlify.toml` already sets the base
   directory, build command and functions.
5. Copy `.env.example` and fill in only what you need. Real values belong in Netlify's
   environment variables and GitHub Actions secrets, never in the repo.

The code is open, so please don't commit keys, passwords or personal addresses. Use the
environment variables above instead.

## Contact

contact@wikiwikigame.anonaddy.me
