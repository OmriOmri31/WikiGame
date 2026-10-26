// Keeping the exact Google name skips the blocked-words check; typed names never do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NICKNAME_ERRORS, isGoogleName, nicknameProblem } from '../src/nicknameRules.js';
import { handleNameAlert } from '../netlify/functions/name-alert.js';

test('kept Google name with a blocked word is allowed', () => {
  assert.equal(nicknameProblem('בן זיני', { googleName: 'בן זיני' }), '');
  assert.equal(nicknameProblem('  בן   זיני ', { googleName: 'בן זיני' }), '');
  assert.equal(isGoogleName('בן זיני', ' בן  זיני'), true);
});

test('typed or edited names get the full check', () => {
  assert.equal(nicknameProblem('בן זיני'), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('בן זיני1', { googleName: 'בן זיני' }), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('בן-זיני', { googleName: 'בן זיני' }), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('בןזיני', { googleName: 'בן זיני' }), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('fucker', { googleName: 'בן זיני' }), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('בן זיני', { googleName: '' }), NICKNAME_ERRORS.blocked);
});

test('Google name must still fit the format and reserved rules', () => {
  assert.equal(nicknameProblem('Benjamin Zini', { googleName: 'Benjamin Zini' }), NICKNAME_ERRORS.long);
  assert.equal(nicknameProblem('Ben Zini!', { googleName: 'Ben Zini!' }), NICKNAME_ERRORS.chars);
  assert.equal(nicknameProblem('Wiki Bot', { googleName: 'Wiki Bot' }), NICKNAME_ERRORS.reserved);
});

// The function, with Google and Resend faked.
function fakeFetch({ provider = 'google.com', googleName = 'בן זיני', saved = 'בן זיני', ok = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('accounts:lookup')) {
      if (!ok) return new Response('{}', { status: 400 });
      return Response.json({ users: [{ localId: 'u1', email: 'ben@example.com', providerUserInfo: [{ providerId: provider, displayName: googleName }] }] });
    }
    if (String(url).includes('firestore.googleapis.com')) return Response.json({ fields: { nickname: { stringValue: saved } } });
    if (String(url).includes('api.resend.com')) return Response.json({ id: 'x' });
    throw new Error(`unexpected ${url}`);
  };
  return calls;
}
const call = (nickname, token = 'tok') => handleNameAlert(new Request('https://x/.netlify/functions/name-alert', {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  body: JSON.stringify({ nickname }),
}));

test('alert: sends for a real Google name with a blocked word', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.NAME_ALERT_TO = 'owner@example.com';
  const calls = fakeFetch();
  const response = await call('בן זיני');
  assert.deepEqual(await response.json(), { sent: true });
  const send = calls.find((c) => c.url.includes('resend'));
  const body = JSON.parse(send.init.body);
  assert.deepEqual(body.to, ['owner@example.com']);
  assert.match(body.text, /u1/);
  assert.match(body.text, /ben@example\.com/);
  assert.match(body.text, /console\.firebase\.google\.com\/project\/wikigame-5ebec\/authentication\/users/);
  assert.ok(send.init.headers['idempotency-key']);
});

test('alert: refuses fakes', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.NAME_ALERT_TO = 'owner@example.com';
  assert.equal((await call('בן זיני', '')).status, 403);
  fakeFetch({ ok: false });
  assert.equal((await call('בן זיני')).status, 403);
  fakeFetch({ provider: 'password' });
  assert.equal((await call('בן זיני')).status, 403);
  fakeFetch({ googleName: 'Ben Cohen' });
  assert.equal((await call('בן זיני')).status, 403);
  fakeFetch({ saved: 'other' });
  assert.equal((await call('בן זיני')).status, 409);
  const calls = fakeFetch({ googleName: 'Omri Nir', saved: 'Omri Nir' });
  assert.deepEqual(await (await call('Omri Nir')).json(), { sent: false, reason: 'clean' });
  assert.ok(!calls.some((c) => c.url.includes('resend')));
});

test('alert: no key means no email, still 200', async () => {
  delete process.env.RESEND_API_KEY;
  const calls = fakeFetch();
  const response = await call('בן זיני');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: false, reason: 'no key' });
  assert.ok(!calls.some((c) => c.url.includes('resend')));
});
