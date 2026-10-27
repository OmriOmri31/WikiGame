// npm audit gate: fails on any high or critical advisory in the given package folder, except the
// ones listed in audit-allowlist.json with a reason (for example, server-only code the browser
// never runs). Usage: node scripts/ci/audit.mjs web [--omit=dev] [--report-only]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [dir, ...flags] = process.argv.slice(2);
const reportOnly = flags.includes('--report-only');
const npmFlags = flags.filter((flag) => flag.startsWith('--omit'));
const allowlist = JSON.parse(readFileSync(new URL('./audit-allowlist.json', import.meta.url), 'utf8'));

let raw;
try {
  raw = execFileSync('npm', ['audit', '--json', ...npmFlags], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch (error) {
  raw = error.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);
if (report.error) throw new Error(`npm audit failed in ${dir}: ${report.error.summary ?? JSON.stringify(report.error)}`);

const blocking = [];
const allowed = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string' || !['high', 'critical'].includes(via.severity)) continue;
    const id = via.url?.split('/').pop();
    const entry = allowlist.find((item) => item.id === id && (!item.package || item.package === via.name));
    (entry ? allowed : blocking).push(`${via.severity} ${via.name} (${name}): ${via.title} ${via.url}${entry ? ` - allowed: ${entry.reason}` : ''}`);
  }
}
const unique = (list) => [...new Set(list)];
for (const line of unique(allowed)) console.log(`allowed  ${line}`);
const counts = report.metadata?.vulnerabilities ?? {};
console.log(`npm audit ${dir}: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate`);
if (unique(blocking).length) {
  const text = unique(blocking).map((line) => `  ${line}`).join('\n');
  if (reportOnly) {
    console.log(`::warning title=npm audit (${dir}, report only)::${unique(blocking).length} high/critical advisories in test tooling`);
    console.log(text);
  } else {
    console.error(`High/critical advisories in ${dir}:\n${text}`);
    process.exit(1);
  }
}
