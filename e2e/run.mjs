// npm test [-- playwright args]: copies the real rules next to firebase.json (the emulator only
// reads files inside this folder), starts the Firestore and Auth emulators, runs Playwright.
import { copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

copyFileSync(new URL('../firestore.rules', import.meta.url), new URL('./firestore.rules', import.meta.url));
const args = process.argv.slice(2).map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
const run = spawnSync('npx', [
  'firebase', 'emulators:exec', '--only', 'firestore,auth', '--project', 'demo-wikiwiki',
  `npx playwright test ${args}`,
], { stdio: 'inherit', cwd: new URL('.', import.meta.url).pathname });
process.exit(run.status ?? 1);
