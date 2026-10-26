import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-wiki-nickname-format', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
const t = async (label, p, ok) => { try { await (ok ? assertSucceeds : assertFails)(p); console.log('PASS', label); } catch (e) { console.log('FAIL', label, e.message); process.exitCode = 1; } };
const ctx = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  // A player who picked a long nickname before the 8-character limit.
  await setDoc(doc(db, 'users', 'legacy'), { nickname: 'Very Long Old Name', key: 'very long old name' });
  await setDoc(doc(db, 'nicknames', 'very long old name'), { uid: 'legacy', name: 'Very Long Old Name' });
  // A nickname document that already exists for a name that no longer fits.
  await setDoc(doc(db, 'nicknames', 'too long name'), { uid: 'sam', name: 'Too Long Name' });
});

// Same writes as claimNickname in the app: reserve the key and point the profile at it.
let n = 0;
function claim(name, { uid = `p${++n}`, release = '' } = {}) {
  const db = ctx(uid);
  const key = name.toLowerCase();
  const batch = writeBatch(db);
  if (release) batch.delete(doc(db, 'nicknames', release));
  batch.set(doc(db, 'nicknames', key), { uid, name, createdAt: Timestamp.now() });
  batch.set(doc(db, 'users', uid), { nickname: name, key, updatedAt: Timestamp.now() });
  return batch.commit();
}

await t('English nickname', claim('Omri'), true);
await t('9 English letters', claim('Abcdefghi'), true);
await t('9 Hebrew letters', claim('אבגדהוזחט'), true);
await t('Hebrew final letters', claim('ךםןףץ'), true);
await t('digits and - _ =', claim('a-1_b=2'), true);
await t('2 characters', claim('ab'), true);
await t('1 character', claim('a'), false);
await t('10 English letters', claim('Abcdefghij'), false);
await t('10 Hebrew letters', claim('אבגדהוזחטי'), false);
await t('first and last name with a space', claim('Omri Nir'), true);
await t('Hebrew name with a space', claim('עומרי ניר'), true);
await t('9 characters with two spaces', claim('ab cd efg'), true);
await t('10 characters with spaces', claim('ab cd efgh'), false);
await t('leading space', claim(' Omri'), false);
await t('trailing space', claim('Omri '), false);
await t('double space', claim('Om  ri'), false);
await t('only spaces', claim('   '), false);
await t('tab', claim('Om\tri'), false);
await t('non-breaking space', claim('Om\u00A0ri'), false);
await t('emoji', claim('Omri😀'), false);
await t('only emoji', claim('😀😀'), false);
await t('exclamation mark', claim('Omri!'), false);
await t('dot', claim('omri.n'), false);
await t('plus sign', claim('a+b'), false);
await t('at sign', claim('ab@c'), false);
await t('apostrophe', claim("o'neil"), false);
await t('Hebrew geresh', claim('ג׳ו'), false);
await t('niqqud', claim('שָׁלוֹם'), false);
await t('accented letter', claim('Café'), false);
await t('zero-width joiner', claim('ab\u200Dc'), false);
await t('reserved bot name in Hebrew', claim('ויקיבוט'), false);
await t('reserved bot name in English', claim('Wiki-Bot'), false);

// Profile alone, against an existing nickname document that's too long.
await t('profile cannot be created with a long nickname', setDoc(doc(ctx('sam'), 'users', 'sam'), { nickname: 'Too Long Name', key: 'too long name' }), false);

// Players who already have a long nickname keep it.
const legacy = ctx('legacy');
await t('long old nickname: profile rewrite with the same nickname', setDoc(doc(legacy, 'users', 'legacy'), { nickname: 'Very Long Old Name', key: 'very long old name', updatedAt: Timestamp.now() }), true);
await t('long old nickname: cannot change to another long nickname', claim('Another Long Name', { uid: 'legacy', release: 'very long old name' }), false);
await t('long old nickname: can move to a valid nickname', claim('Neo', { uid: 'legacy', release: 'very long old name' }), true);
await t('after moving, cannot go back to the long nickname', claim('Very Long Old Name', { uid: 'legacy', release: 'neo' }), false);

await env.cleanup();
