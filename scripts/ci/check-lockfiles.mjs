// Every npm package folder has a committed package-lock.json that matches its package.json, so
// CI and Netlify install exactly what was tested (`npm ci` in each job then enforces the rest).
import { existsSync, readFileSync } from 'node:fs';

const FOLDERS = ['web', 'e2e', 'rules-tests'];
const problems = [];
for (const dir of FOLDERS) {
  const pkg = JSON.parse(readFileSync(new URL(`../../${dir}/package.json`, import.meta.url), 'utf8'));
  const lockUrl = new URL(`../../${dir}/package-lock.json`, import.meta.url);
  if (!existsSync(lockUrl)) { problems.push(`${dir}: package-lock.json is missing`); continue; }
  const lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
  if (lock.lockfileVersion < 3) problems.push(`${dir}: lockfileVersion ${lock.lockfileVersion}, expected 3`);
  const root = lock.packages?.[''] ?? {};
  for (const field of ['dependencies', 'devDependencies']) {
    const want = pkg[field] ?? {};
    const have = root[field] ?? {};
    for (const [name, range] of Object.entries(want)) {
      if (have[name] !== range) problems.push(`${dir}: ${name}@${range} in package.json but ${have[name] ?? 'missing'} in the lockfile`);
      else if (!lock.packages[`node_modules/${name}`]) problems.push(`${dir}: ${name} is not resolved in the lockfile`);
    }
    for (const name of Object.keys(have)) if (!(name in want)) problems.push(`${dir}: ${name} is in the lockfile but not package.json`);
  }
  const registries = new Set(Object.values(lock.packages).map((p) => p.resolved?.match(/^https?:\/\/[^/]+/)?.[0]).filter(Boolean));
  for (const registry of registries) if (registry !== 'https://registry.npmjs.org') problems.push(`${dir}: package resolved from ${registry}`);
}
if (problems.length) {
  console.error(`Lockfile check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Lockfile check passed (${FOLDERS.join(', ')}).`);
