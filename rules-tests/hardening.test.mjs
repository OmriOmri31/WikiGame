// Security hardening: score fields, the score name, free-game ids, profile fields and nickname squatting.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { addDoc, collection, deleteDoc, doc, runTransaction, setDoc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-wiki-hardening',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const alice = env.authenticatedContext('alice', { email_verified: true }).firestore();
const mallory = env.authenticatedContext('mallory', { email_verified: true }).firestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', 'alice'), { nickname: 'Alice', key: 'alice' });
  await setDoc(doc(db, 'nicknames', 'alice'), { uid: 'alice', name: 'Alice' });
  await setDoc(doc(db, 'users', 'mallory'), { nickname: 'Mal', key: 'mal' });
  await setDoc(doc(db, 'nicknames', 'mal'), { uid: 'mallory', name: 'Mal' });
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

// Score contents
await t('normal free score ok', addDoc(scores, score()), true);
await t('free score with fastestPath and gaveUp ok', addDoc(scores, score({ fastestPath: ['א', 'ב'], gaveUp: true })), true);
await t('guest result claimed later (older timestamp) ok', addDoc(scores, score({ timestamp: Timestamp.fromMillis(Date.now() - 3600e3) })), true);
await t('name that is not the nickname blocked', addDoc(scores, score({ name: 'Someone Else' })), false);
await t('offensive free-text name blocked', addDoc(scores, score({ name: 'x'.repeat(500) })), false);
await t('zero pages blocked', addDoc(scores, score({ pagesVisited: 0 })), false);
await t('negative pages blocked', addDoc(scores, score({ pagesVisited: -3 })), false);
await t('fractional pages blocked', addDoc(scores, score({ pagesVisited: 2.5 })), false);
await t('negative time blocked', addDoc(scores, score({ timeTaken: -1 })), false);
await t('string time blocked', addDoc(scores, score({ timeTaken: '1' })), false);
await t('future timestamp blocked', addDoc(scores, score({ timestamp: Timestamp.fromMillis(Date.now() + 86400e3) })), false);
await t('extra field blocked', addDoc(scores, score({ lock: false })), false);
await t('huge path blocked', addDoc(scores, score({ path: Array(1001).fill('x') })), false);
await t('long title blocked', addDoc(scores, score({ startTitle: 'x'.repeat(301) })), false);
await t('path not a list blocked', addDoc(scores, score({ path: 'א' })), false);
await t('player without a profile blocked', addDoc(collection(env.authenticatedContext('nobody', { email_verified: true }).firestore(), 'scores'), score({ uid: 'nobody', name: 'שחקן' })), false);

// Free games cannot take a fixed id (someone's daily row, a bot row)
await t('free score squatting another daily id blocked', setDoc(doc(mallory, 'scores', `daily_alice_${today}`), score({ uid: 'mallory', name: 'Mal' })), false);
await t('free score squatting a bot id blocked', setDoc(doc(mallory, 'scores', 'wiki-bot-30c7d833-d36fcb7c'), score({ uid: 'mallory', name: 'Mal' })), false);
await t('free score with a random 20-char id ok', setDoc(doc(mallory, 'scores', 'AbCdEfGhIjKlMnOpQrSt'), score({ uid: 'mallory', name: 'Mal' })), true);

// Daily row: created by the app's transaction, replaced only with a valid better result
const dailyRef = doc(alice, 'scores', `daily_alice_${today}`);
await t('daily transaction save ok', runTransaction(alice, async (tx) => {
  const snap = await tx.get(dailyRef);
  if (!snap.exists()) tx.set(dailyRef, score({ mode: 'daily', dayKey: today }));
}), true);
await t('daily improve ok', updateDoc(dailyRef, { name: 'Alice', pagesVisited: 3, timeTaken: 20, timestamp: Timestamp.now(), path: ['א', 'ג', 'ב'] }), true);
await t('daily improve to zero pages blocked', updateDoc(dailyRef, { pagesVisited: 0 }), false);
await t('daily improve with negative time blocked', updateDoc(dailyRef, { pagesVisited: 3, timeTaken: -5 }), false);
await t('daily improve with another name blocked', updateDoc(dailyRef, { pagesVisited: 2, name: 'Bad Words' }), false);

// Profiles and nickname squatting
await t('profile with an extra field blocked', runTransaction(alice, async (tx) => {
  tx.set(doc(alice, 'users', 'alice'), { nickname: 'Alice', key: 'alice', isAdmin: true });
}), false);
await t('moving to a new nickname while keeping the old one blocked', (async () => {
  const b = writeBatch(alice);
  b.set(doc(alice, 'nicknames', 'alice2'), { uid: 'alice', name: 'Alice2' });
  b.set(doc(alice, 'users', 'alice'), { nickname: 'Alice2', key: 'alice2' });
  await b.commit();
})(), false);
await t('nickname doc with an extra field blocked', (async () => {
  const b = writeBatch(alice);
  b.set(doc(alice, 'nicknames', 'alice3'), { uid: 'alice', name: 'Alice3', note: 'x' });
  b.delete(doc(alice, 'nicknames', 'alice'));
  b.set(doc(alice, 'users', 'alice'), { nickname: 'Alice3', key: 'alice3' });
  await b.commit();
})(), false);
await t('moving to a new nickname and releasing the old one ok', (async () => {
  const b = writeBatch(alice);
  b.set(doc(alice, 'nicknames', 'alice4'), { uid: 'alice', name: 'Alice4', createdAt: Timestamp.now() });
  b.delete(doc(alice, 'nicknames', 'alice'));
  b.set(doc(alice, 'users', 'alice'), { nickname: 'Alice4', key: 'alice4', updatedAt: Timestamp.now() });
  await b.commit();
})(), true);
await t('old nickname is free for others afterwards', (async () => {
  const b = writeBatch(mallory);
  b.set(doc(mallory, 'nicknames', 'alice'), { uid: 'mallory', name: 'Alice' });
  b.delete(doc(mallory, 'nicknames', 'mal'));
  b.set(doc(mallory, 'users', 'mallory'), { nickname: 'Alice', key: 'alice' });
  await b.commit();
})(), true);
await t('score under the old nickname blocked after the move', addDoc(scores, score({ name: 'Alice' })), false);
await t('score under the new nickname ok', addDoc(scores, score({ name: 'Alice4' })), true);
await env.cleanup();
