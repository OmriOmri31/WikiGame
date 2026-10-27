// Fails if the repo (tracked files) or a built folder holds something that must stay private:
// personal email addresses, API keys or tokens, private keys, or committed .env files.
// The public Firebase web config and the public contact alias are allowed.
//
// Usage (from the repo root):
//   node scripts/ci/check-secrets.mjs [built-dir ...]
//   SECRET_CODE_FILE=/path/to/secret-code.txt node scripts/ci/check-secrets.mjs web/dist
// With SECRET_CODE_FILE, it also fails if the test site's secret code appears anywhere. The code
// is read from that file only, compared in memory and never printed. CI has no copy of it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);

const ALLOWED_EMAILS = [
  /^contact@wikiwikigame\.anonaddy\.me$/i,
  /@users\.noreply\.github\.com$/i,
  /@example\.(com|org|net)$/i,
  /^onboarding@resend\.dev$/i, // Resend's shared sender address
  // Placeholders in docs and package metadata of bundled libraries.
  /^(you|your-email|name|user|someone|test)@/i,
];
// Library license headers and similar that end up in built bundles.
const ALLOWED_EMAIL_DOMAINS = /@(fb\.com|google\.com|googlegroups\.com|firebase\.google\.com)$/i;

const PUBLIC_FIREBASE_KEY = 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ';

const KEY_PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g, (m) => m !== PUBLIC_FIREBASE_KEY],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['Resend API key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{24,}\b/g],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Netlify token', /\bnf[pc]_[A-Za-z0-9]{30,}\b/g],
  // The test site's unlisted desk page lives at /m-<long secret>. Only the CI fake may appear.
  ['test desk path', /\bm-[A-Za-z0-9_-]{40,}/g, (m) => !m.startsWith('m-ci-fake-desk-path-')],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['Service account key', /"private_key"\s*:\s*"-----BEGIN/g],
];

const FORBIDDEN_FILES = [
  [/(^|\/)\.env(\..+)?$/, (path) => !/(^|\/)\.env\.example$/.test(path)],
  [/\.(pem|p12|pfx|key)$/],
  [/(^|\/)(firebase-key|service-account[^/]*|credentials)\.json$/],
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|gz|pdf|mp4|webm)$/i;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const extra = process.argv.slice(2).flatMap((dir) => {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist (build it first)`);
  return walk(dir).map((path) => relative(root, path));
});

let secretCode = '';
if (process.env.SECRET_CODE_FILE) {
  secretCode = readFileSync(process.env.SECRET_CODE_FILE, 'utf8').trim();
  if (secretCode.length < 4) throw new Error('SECRET_CODE_FILE looks empty');
}

const problems = [];
for (const path of tracked) {
  for (const [pattern, when = () => true] of FORBIDDEN_FILES) {
    if (pattern.test(path) && when(path)) problems.push(`${path}: this kind of file must not be committed`);
  }
}

for (const path of [...tracked, ...extra]) {
  if (BINARY.test(path) || !existsSync(path) || statSync(path).isDirectory()) continue;
  const text = readFileSync(path, 'utf8');
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const [label, pattern, keep = () => true] of KEY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (keep(match[0])) problems.push(`${path}:${lineOf(match.index)}: looks like a ${label}`);
    }
  }
  // npm writes package authors into lockfiles; those are not ours.
  const emails = /(^|\/)package-lock\.json$/.test(path) ? [] : text.matchAll(EMAIL);
  for (const match of emails) {
    const email = match[0].replace(/\.+$/, '');
    if (/\.(png|jpe?g|svg|webp|js|css)$/i.test(email)) continue; // file names like icon@2x.png
    if (ALLOWED_EMAILS.some((rule) => rule.test(email)) || ALLOWED_EMAIL_DOMAINS.test(email)) continue;
    problems.push(`${path}:${lineOf(match.index)}: email address ${email.replace(/^(.).*@/, '$1…@')}`);
  }
  if (secretCode && text.includes(secretCode)) problems.push(`${path}: contains the test site's secret code`);
}

const scanned = tracked.length + extra.length;
if (problems.length) {
  console.error(`Secret check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Secret check passed: ${scanned} files${secretCode ? ', secret code checked' : ''}.`);
