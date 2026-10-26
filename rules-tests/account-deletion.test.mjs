import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-wiki-account-deletion', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url),'utf8'), host:'127.0.0.1', port:8085 } });
const t = async (label, p, ok) => { try { await (ok?assertSucceeds:assertFails)(p); console.log('PASS', label); } catch(e){ console.log('FAIL', label, e.message); process.exitCode=1; } };
const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); process.exitCode = 1; } };
const ctx = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified }).firestore();
const alice = ctx('alice');
const carol = ctx('carol');
const bob = ctx('bob', false);
const owner = ctx('bsoHTJvKDiOr3qzvmL1EIHdnsji1');
const botCtx = ctx('wiki-bot');
const anon = env.unauthenticatedContext().firestore();
const score = (uid, extra = {}) => ({ uid, name: uid, mode: 'free', pagesVisited: 3, timeTaken: 9, timestamp: Timestamp.now(), startTitle: 'א', goalTitle: 'ב', path: ['א', 'ב'], ...extra });

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  const put = (path, data) => setDoc(doc(db, ...path.split('/')), data);
  await put('users/alice', { nickname: 'Alice', key: 'alice' });
  await put('nicknames/alice', { uid: 'alice', name: 'Alice' });
  await put('users/carol', { nickname: 'Carol', key: 'carol' });
  await put('nicknames/carol', { uid: 'carol', name: 'Carol' });
  await put('scores/a-free', score('alice'));
  await put('scores/daily_alice_2026-10-20', score('alice', { mode: 'daily', dayKey: '2026-10-20' }));
  await put('scores/a-reasoner-flag', score('alice', { reasoner: true }));
  await put('scores/a-bot-flag', score('alice', { bot: true }));
  await put('scores/c-free', score('carol'));
  await put('scores/bot-daily', score('wiki-bot', { bot: true, mode: 'daily' }));
  await put('scores/reasoner-daily', score('wiki-reasoner', { reasoner: true, mode: 'daily' }));
  await put('scores/b-free', score('bob'));
  await put('users/dave', { nickname: 'Dave' });
  await put('users/erin', { nickname: 'Shared', key: 'shared' });
  await put('nicknames/shared', { uid: 'someone-else', name: 'Shared' });
  await put('users/frank', { nickname: 'Old', key: 'old' });
  await put('nicknames/old', { uid: 'frank', name: 'Old' });
  for (let i = 0; i < 3; i += 1) await put(`scores/g-${i}`, score('george'));
  await put('users/george', { nickname: 'George', key: 'george' });
  await put('nicknames/george', { uid: 'george', name: 'George' });
});

// Scores: only the owner, never bots.
await t('anon cannot delete a score', deleteDoc(doc(anon, 'scores', 'a-free')), false);
await t('another player cannot delete my score', deleteDoc(doc(carol, 'scores', 'a-free')), false);
await t('I cannot delete another player score', deleteDoc(doc(alice, 'scores', 'c-free')), false);
await t('desk owner cannot delete a player score', deleteDoc(doc(owner, 'scores', 'a-free')), false);
await t('player cannot delete the wiki-bot score', deleteDoc(doc(alice, 'scores', 'bot-daily')), false);
await t('player cannot delete the wiki-reasoner score', deleteDoc(doc(alice, 'scores', 'reasoner-daily')), false);
await t('wiki-bot uid cannot delete bot scores from the client', deleteDoc(doc(botCtx, 'scores', 'bot-daily')), false);
await t('own row flagged reasoner stays', deleteDoc(doc(alice, 'scores', 'a-reasoner-flag')), false);
await t('own row flagged bot stays', deleteDoc(doc(alice, 'scores', 'a-bot-flag')), false);
await t('owner deletes own free score', deleteDoc(doc(alice, 'scores', 'a-free')), true);
await t('owner deletes own daily score', deleteDoc(doc(alice, 'scores', 'daily_alice_2026-10-20')), true);
await t('unverified owner deletes own score', deleteDoc(doc(bob, 'scores', 'b-free')), true);

// Profile and nickname: only the owner, and only together.
await t('profile alone cannot go while the nickname is held', deleteDoc(doc(alice, 'users', 'alice')), false);
await t('nickname alone cannot go while the profile points to it', deleteDoc(doc(alice, 'nicknames', 'alice')), false);
await t('another player cannot delete my profile', deleteDoc(doc(carol, 'users', 'alice')), false);
await t('another player cannot delete my nickname', deleteDoc(doc(carol, 'nicknames', 'alice')), false);
{
  const batch = writeBatch(carol);
  batch.delete(doc(carol, 'nicknames', 'alice'));
  batch.delete(doc(carol, 'users', 'alice'));
  await t('another player cannot delete my profile and nickname together', batch.commit(), false);
}
await t('anon cannot delete a profile', deleteDoc(doc(anon, 'users', 'alice')), false);
{
  const batch = writeBatch(alice);
  batch.delete(doc(alice, 'nicknames', 'alice'));
  batch.delete(doc(alice, 'users', 'alice'));
  await t('owner deletes profile and nickname together', batch.commit(), true);
}
await t('profile without a nickname key can be deleted by its owner', deleteDoc(doc(ctx('dave'), 'users', 'dave')), true);
await t('profile whose nickname belongs to someone else can be deleted', deleteDoc(doc(ctx('erin'), 'users', 'erin')), true);
await t('someone else nickname is not released by that', deleteDoc(doc(ctx('erin'), 'nicknames', 'shared')), false);

// Changing nickname still works with the new nickname rule.
{
  const frank = ctx('frank');
  const batch = writeBatch(frank);
  batch.set(doc(frank, 'nicknames', 'new'), { uid: 'frank', name: 'New' });
  batch.set(doc(frank, 'users', 'frank'), { nickname: 'New', key: 'new' });
  batch.delete(doc(frank, 'nicknames', 'old'));
  await t('nickname change still releases the old nickname', batch.commit(), true);
}

// The app's full deletion flow: scores first, then nickname and profile in one write.
{
  const george = ctx('george');
  const snap = await getDocs(query(collection(george, 'scores'), where('uid', '==', 'george')));
  const scoresBatch = writeBatch(george);
  snap.docs.forEach((entry) => scoresBatch.delete(entry.ref));
  await t('flow: delete all my scores in one batch', scoresBatch.commit(), true);
  const profileBatch = writeBatch(george);
  profileBatch.delete(doc(george, 'nicknames', 'george'));
  profileBatch.delete(doc(george, 'users', 'george'));
  await t('flow: delete nickname and profile', profileBatch.commit(), true);
}

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  const exists = async (path) => (await getDoc(doc(db, ...path.split('/')))).exists();
  check('after: alice profile and nickname are gone', !(await exists('users/alice')) && !(await exists('nicknames/alice')));
  check('after: bot rows and other players are untouched', (await exists('scores/bot-daily')) && (await exists('scores/reasoner-daily')) && (await exists('scores/c-free')) && (await exists('users/carol')));
  const left = await getDocs(query(collection(db, 'scores'), where('uid', '==', 'george')));
  check('after: george has no scores, profile or nickname', left.empty && !(await exists('users/george')) && !(await exists('nicknames/george')));
});

await env.cleanup();
