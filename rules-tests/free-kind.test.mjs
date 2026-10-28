// The free game's kind on a score (freeKind): only on free scores, only the three known kinds.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { addDoc, collection, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-wiki-free-kind',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const alice = env.authenticatedContext('alice', { email_verified: true }).firestore();
const bob = env.authenticatedContext('bob', { email_verified: true }).firestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', 'alice'), { nickname: 'Alice', key: 'alice' });
  await setDoc(doc(db, 'nicknames', 'alice'), { uid: 'alice', name: 'Alice' });
});
const t = async (label, p, ok) => {
  try { await (ok ? assertSucceeds : assertFails)(p); console.log('PASS', label); }
  catch (e) { console.log('FAIL', label, e.message); process.exitCode = 1; }
};
const score = (extra = {}) => ({
  uid: 'alice', name: 'Alice', pagesVisited: 4, timeTaken: 31.2, timestamp: Timestamp.now(), mode: 'free',
  startTitle: 'א', goalTitle: 'ב', path: ['א', 'ג', 'ד', 'ב'], ...extra,
});
const scores = collection(alice, 'scores');

await t('free score without a kind still ok', addDoc(scores, score()), true);
await t('free score of kind random ok', addDoc(scores, score({ freeKind: 'random' })), true);
await t('free score of kind easy ok', addDoc(scores, score({ freeKind: 'easy' })), true);
await t('free score of kind custom ok', addDoc(scores, score({ freeKind: 'custom', gaveUp: true })), true);
await t('unknown kind blocked', addDoc(scores, score({ freeKind: 'hard' })), false);
await t('kind that is not text blocked', addDoc(scores, score({ freeKind: 1 })), false);
await t('very long kind blocked', addDoc(scores, score({ freeKind: 'x'.repeat(500) })), false);
await t('daily score with a kind blocked', setDoc(doc(alice, 'scores', `daily_alice_${today}`),
  score({ mode: 'daily', dayKey: today, freeKind: 'easy' })), false);
await t('daily score without a kind still ok', setDoc(doc(alice, 'scores', `daily_alice_${today}`),
  score({ mode: 'daily', dayKey: today })), true);

const ref = await addDoc(scores, score({ freeKind: 'custom' }));
await t('owner can read own free score with its kind', getDoc(ref), true);
await t('other players still cannot read it', getDoc(doc(bob, 'scores', ref.id)), false);
await t('shortest path can still be attached to a free score with a kind', updateDoc(ref, { fastestPath: ['א', 'ב'] }), true);
const other = await addDoc(scores, score({ freeKind: 'easy' }));
await t('the kind cannot be changed afterwards', updateDoc(other, { freeKind: 'custom' }), false);
await t('the kind cannot be added afterwards', updateDoc(await addDoc(scores, score()), { freeKind: 'easy' }), false);
await env.cleanup();
