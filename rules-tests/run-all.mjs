// Runs every rules test file against the Firestore emulator and prints a total.
// Usage (from this folder): npm test
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';

const files = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.test.mjs')).sort();
let pass = 0;
let fail = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, [file], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
  const lines = (run.stdout || '').split('\n').filter(Boolean);
  const filePass = lines.filter((line) => line.startsWith('PASS')).length;
  const fileFail = lines.filter((line) => line.startsWith('FAIL'));
  pass += filePass;
  fail += fileFail.length + (run.status && !fileFail.length ? 1 : 0);
  console.log(`${file}: ${filePass} passed${fileFail.length ? `, ${fileFail.length} failed` : ''}`);
  fileFail.forEach((line) => console.log(`  ${line}`));
  if (run.status && !fileFail.length) console.log(run.stderr);
}
console.log(`\nTotal: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
