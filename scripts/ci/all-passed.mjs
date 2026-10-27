// Final CI gate: reads the `needs` context (JSON on stdin) and fails unless every job succeeded.
import { readFileSync } from 'node:fs';

const needs = JSON.parse(readFileSync(0, 'utf8'));
for (const [name, job] of Object.entries(needs)) console.log(`${name}: ${job.result}`);
const bad = Object.entries(needs).filter(([, job]) => job.result !== 'success');
if (bad.length) {
  console.error(`Failed or skipped: ${bad.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
