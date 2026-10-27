// Hebrew / right-to-left sanity for the source: the page and the app manifest are Hebrew RTL,
// and no source file has broken encoding (mojibake like "×©" or the replacement character "�"),
// which is what Hebrew text looks like after a wrong-encoding save.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const problems = [];

const html = readFileSync('web/index.html', 'utf8');
if (!/<html[^>]*\blang="he"[^>]*\bdir="rtl"/.test(html)) problems.push('web/index.html: <html> is not lang="he" dir="rtl"');
if (!/<meta charset="UTF-8"/i.test(html)) problems.push('web/index.html: no UTF-8 charset');
const manifest = JSON.parse(readFileSync('web/public/manifest.webmanifest', 'utf8'));
if (manifest.lang !== 'he' || manifest.dir !== 'rtl') problems.push('manifest.webmanifest: lang/dir are not he/rtl');

const files = execFileSync('git', ['ls-files', '-z', 'web/src', 'web/index.html', 'web/public/*.webmanifest', 'web/netlify', 'README.md'], { encoding: 'utf8' })
  .split('\0').filter((file) => /\.(jsx?|mjs|css|html|md|webmanifest|json)$/.test(file));
let hebrewFiles = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/[\u0590-\u05FF]/.test(text)) hebrewFiles += 1;
  if (text.includes('\uFFFD')) problems.push(`${file}: contains the replacement character (broken encoding)`);
  if (/×[\u0080-\u00BF]|Ã[\u0080-\u00BF]|×\u2122|×ž/.test(text)) problems.push(`${file}: looks like Hebrew saved in the wrong encoding`);
}
if (hebrewFiles < 5) problems.push(`only ${hebrewFiles} source files contain Hebrew; expected the UI to be in Hebrew`);

if (problems.length) {
  console.error(`Hebrew/RTL check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Hebrew/RTL check passed (${files.length} files, ${hebrewFiles} with Hebrew).`);
