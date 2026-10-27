// Read-only check that the real services the game needs are reachable and look right.
// It only reads public data: today's daily pair from Firestore (public read in firestore.rules),
// and one Hebrew Wikipedia article. Nothing is written. Runs in CI as an information-only job,
// because an outage at Google or Wikipedia should not block a merge.
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../../web/src/firebase.js', import.meta.url), 'utf8');
const projectId = config.match(/projectId:\s*'([^']+)'/)?.[1];
const apiKey = config.match(/apiKey:\s*'([^']+)'/)?.[1];
if (!projectId || !apiKey) throw new Error('could not read the Firebase web config from web/src/firebase.js');

async function get(url, label) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'WikiGame-CI-smoke (github.com/OmriOmri31/WikiGame)' }, signal: AbortSignal.timeout(15_000) });
      if (response.ok) return response.json();
      if (attempt >= 3 || response.status < 500) throw new Error(`${label}: HTTP ${response.status}`);
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
}

const daily = await get(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/daily/articles?key=${apiKey}`,
  'Firestore daily/articles',
);
const fields = daily.fields ?? {};
for (const name of ['startArticleTitle', 'targetArticleTitle']) {
  if (!fields[name]?.stringValue) throw new Error(`Firestore daily/articles has no ${name}`);
}
console.log(`Firebase (${projectId}) is reachable; the daily pair is set.`);

const wiki = await get(
  'https://he.wikipedia.org/w/api.php?action=parse&page=%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D&prop=text&format=json&formatversion=2&origin=*',
  'Hebrew Wikipedia',
);
if (!wiki.parse?.text?.includes('<a ')) throw new Error('Hebrew Wikipedia returned an article without links');
console.log('Hebrew Wikipedia is reachable and returns articles with links.');
