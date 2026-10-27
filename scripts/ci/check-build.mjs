// Checks a built site before it can ship.
//
//   node scripts/ci/check-build.mjs prod web/dist
//     The production build: no test-site code (five-tap secret prompt, test admin, test desk,
//     TEST branding), no e2e emulator wiring, the security headers in netlify.toml are in place
//     and match the built index.html, and the bundle stays within its size budget.
//
//   node scripts/ci/check-build.mjs testsite <dir>
//     A test-site build made with fake values (see TESTING.md). It must contain the markers the
//     prod check looks for, which proves those markers are real and the prod check is meaningful.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const [mode, dir] = process.argv.slice(2);
if (!['prod', 'testsite'].includes(mode) || !dir) {
  console.error('usage: check-build.mjs prod|testsite <dist-dir>');
  process.exit(2);
}

// Size budgets (gzip KB). Current sizes are in TESTING.md; each budget has ~20-25% headroom.
const BUDGET = {
  initialJs: 340, // index + the vendor chunks index.html preloads (current ~274)
  totalJs: 400, // every JS chunk, including lazy screens (current ~316)
  css: 22, // (current ~14)
  chunkRaw: 700, // any single JS file before gzip, same as chunkSizeWarningLimit (largest ~493)
  distMb: 4, // whole folder incl. images and data (current ~2.6)
};

// Test-site-only strings. Fake values come from TESTING.md / ci.yml, never real ones.
const FAKE = {
  code: 'ci-fake-secret-code',
  admin: 'ci-fake-admin-uid',
  desk: 'm-ci-fake-desk-path-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};
const TEST_MARKERS = [
  ['the five-tap secret code prompt', 'הזן קוד סודי'],
  ["the test admin's separate queue", 'lotteryQueue_test'],
  ['the TEST page title', 'TEST ·'],
  ['the test-site icons', 'favicon-test-64.png'],
];
const E2E_MARKERS = [
  ['the Auth emulator address', '127.0.0.1:9099'],
  ['the emulator demo project', 'demo-wikiwiki'],
];
const DESK_PATH = /\/?m-[A-Za-z0-9_-]{40,}/;

function walk(path) {
  return statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(join(path, name))) : [path];
}
const files = walk(dir);
const texts = files
  .filter((file) => /\.(html|js|css|json|webmanifest|txt)$/.test(file))
  .map((file) => ({ file: relative(dir, file), text: readFileSync(file, 'utf8') }));
const find = (needle) => texts.filter(({ text }) => (needle instanceof RegExp ? needle.test(text) : text.includes(needle)));

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

if (mode === 'testsite') {
  for (const [label, marker] of TEST_MARKERS) check(find(marker).length > 0, `test build is missing ${label}`);
  check(find(FAKE.code).length > 0, 'test build does not carry the secret code');
  check(find(FAKE.admin).length > 0, 'test build does not carry the test admin id');
  check(find(FAKE.desk).length > 0, 'test build does not carry the test desk path');
} else {
  for (const [label, marker] of [...TEST_MARKERS, ...E2E_MARKERS]) {
    for (const { file } of find(marker)) problems.push(`${file}: production build contains ${label}`);
  }
  for (const value of Object.values(FAKE)) {
    for (const { file } of find(value)) problems.push(`${file}: production build contains a test-site value`);
  }
  for (const { file } of find(DESK_PATH)) problems.push(`${file}: production build contains something shaped like the test desk path`);
  // The browser build must never carry a gRPC client (grpc-js is server/Node-only; see TESTING.md).
  for (const { file } of find(/getAuthContext|@grpc\/grpc-js/)) problems.push(`${file}: the gRPC client is in the browser build (see TESTING.md, npm audit)`);
  check(find('wikigame-5ebec').length > 0, 'production build has no Firebase config for wikigame-5ebec');

  // Security headers, and the CSP hash of the inline theme script in the *built* index.html.
  const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const header = (name) => toml.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
  const csp = header('Content-Security-Policy') ?? '';
  check(csp, 'netlify.toml has no Content-Security-Policy');
  for (const part of ["script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
    check(csp.includes(part), `CSP is missing ${part}`);
  }
  for (const loose of ["'unsafe-inline'", "'unsafe-eval'", ' * ', 'http:']) check(!csp.includes(loose), `CSP allows ${loose.trim()}`);
  check(header('X-Frame-Options') === 'DENY', 'X-Frame-Options is not DENY');
  check(header('X-Content-Type-Options') === 'nosniff', 'X-Content-Type-Options is not nosniff');
  check(Boolean(header('Referrer-Policy')), 'Referrer-Policy is missing');
  check(Boolean(header('Cross-Origin-Opener-Policy')), 'Cross-Origin-Opener-Policy is missing');
  check(/camera=\(\)/.test(header('Permissions-Policy') ?? ''), 'Permissions-Policy is missing or allows the camera');
  check(/for\s*=\s*"\/\*"/.test(toml), 'the headers do not apply to every path (for = "/*")');

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  check(inline.length > 0, 'built index.html has no inline theme script (did the CSP test change?)');
  for (const script of inline) {
    const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
    check(csp.includes(hash), `built index.html has an inline script whose hash ${hash} is not in the CSP`);
  }

  // Size budgets.
  const gz = (file) => gzipSync(readFileSync(join(dir, file))).length / 1024;
  const js = files.map((file) => relative(dir, file)).filter((file) => file.endsWith('.js') && file.startsWith('assets/'));
  const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const css = files.map((file) => relative(dir, file)).filter((file) => file.endsWith('.css'));
  const sizes = {
    initialJs: initial.reduce((sum, file) => sum + gz(file), 0),
    totalJs: js.reduce((sum, file) => sum + gz(file), 0),
    css: css.reduce((sum, file) => sum + gz(file), 0),
    chunkRaw: Math.max(...js.map((file) => statSync(join(dir, file)).size / 1024)),
    distMb: files.reduce((sum, file) => sum + statSync(file).size, 0) / 1024 / 1024,
  };
  check(initial.length >= 2, 'could not find the JS that index.html loads');
  for (const [key, limit] of Object.entries(BUDGET)) {
    check(sizes[key] <= limit, `bundle size ${key} is ${sizes[key].toFixed(1)}, over the budget of ${limit}`);
  }
  console.log('Sizes:', Object.entries(sizes).map(([key, value]) => `${key} ${value.toFixed(1)} (budget ${BUDGET[key]})`).join(', '));
}

if (problems.length) {
  console.error(`Build check (${mode}) failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Build check (${mode}) passed for ${dir}.`);
