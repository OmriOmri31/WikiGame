// Free-game scores are private to their player. Daily scores and bot rows stay public.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, Timestamp, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-wiki-free-scores',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const yesterday = '2026-01-01';
const alice = env.authenticatedContext('alice', { email_verified: true }).firestore();
const carol = env.authenticatedContext('carol', { email_verified: true }).firestore();
const anon = env.unauthenticatedContext().firestore();
const row = (uid, mode, extra = {}) => ({
  uid, name: uid, mode, pagesVisited: 3, timeTaken: 9, timestamp: Timestamp.now(),
  startTitle: 'א', goalTitle: 'ב', path: ['א', 'ב'], ...extra,
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  // Scores carry the player's saved nickname.
  await setDoc(doc(db, 'users', 'alice'), { nickname: 'alice', key: 'alice' });
  await setDoc(doc(db, 'users', 'carol'), { nickname: 'carol', key: 'carol' });
  await setDoc(doc(db, 'scores', 'free-alice'), row('alice', 'free'));
  await setDoc(doc(db, 'scores', 'free-carol'), row('carol', 'free'));
  await setDoc(doc(db, 'scores', `daily_alice_${today}`), row('alice', 'daily', { dayKey: today }));
  await setDoc(doc(db, 'scores', `daily_carol_${yesterday}`), row('carol', 'daily', { dayKey: yesterday }));
  await setDoc(doc(db, 'scores', 'bot-today'), row('wiki-bot', 'daily', { bot: true, dayKey: today }));
  await setDoc(doc(db, 'scores', 'bot-old'), row('wiki-reasoner', 'daily', { reasoner: true }));
});

const t = async (label, p, ok) => {
  try { await (ok ? assertSucceeds : assertFails)(p); console.log('PASS', label); }
  catch (e) { console.log('FAIL', label, e.message); process.exitCode = 1; }
};
const ids = async (q) => (await getDocs(q)).docs.map((d) => d.id).sort().join(',');
const check = (label, cond) => { console.log(cond ? 'PASS' : 'FAIL', label); if (!cond) process.exitCode = 1; };

await t('owner reads own free score', getDoc(doc(alice, 'scores', 'free-alice')), true);
await t('other player cannot read a free score', getDoc(doc(carol, 'scores', 'free-alice')), false);
await t('guest cannot read a free score', getDoc(doc(anon, 'scores', 'free-alice')), false);
await t('anyone reads a daily score', getDoc(doc(anon, 'scores', `daily_alice_${today}`)), true);
await t('anyone reads a bot row', getDoc(doc(anon, 'scores', 'bot-old')), true);
await t('missing doc can be read (daily save transaction)', getDoc(doc(carol, 'scores', `daily_carol_${today}`)), true);
await t('old open query (all recent scores) refused', getDocs(query(collection(anon, 'scores'), where('timestamp', '>=', Timestamp.fromMillis(0)))), false);
await t('query by another uid refused', getDocs(query(collection(alice, 'scores'), where('uid', '==', 'carol'))), false);
await t('daily query by day ok for guests', getDocs(query(collection(anon, 'scores'), where('mode', '==', 'daily'), where('dayKey', 'in', [yesterday, today]))), true);
await t('daily query by timestamp ok', getDocs(query(collection(anon, 'scores'), where('mode', '==', 'daily'), where('timestamp', 'in', [Timestamp.fromMillis(0)]))), true);
await t('own uid query ok', getDocs(query(collection(alice, 'scores'), where('uid', '==', 'alice'))), true);
await t('free-mode query by uid only for self', getDocs(query(collection(carol, 'scores'), where('mode', '==', 'free'))), false);
check('daily query returns the daily rows only', await ids(query(collection(anon, 'scores'), where('mode', '==', 'daily'), where('dayKey', 'in', [yesterday, today]))) === `bot-today,daily_alice_${today},daily_carol_${yesterday}`);
check('own query returns own free and daily rows', await ids(query(collection(alice, 'scores'), where('uid', '==', 'alice'))) === `daily_alice_${today},free-alice`);
await t('daily save transaction still works', runTransaction(carol, async (tx) => {
  const ref = doc(carol, 'scores', `daily_carol_${today}`);
  const snap = await tx.get(ref);
  if (!snap.exists()) tx.set(ref, row('carol', 'daily', { dayKey: today }));
}), true);
await env.cleanup();
