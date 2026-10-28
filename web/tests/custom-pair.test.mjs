// Run with: npm test (from web/). Checking a pair the player chose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCustomPair } from '../src/customPair.js';
import { cleanFreeKind, FREE_KINDS } from '../src/freeKind.js';

const ARTICLES = { 'חתול': 'חתול', 'חתולים': 'חתול', 'כלב': 'כלב', 'ירושלים': 'ירושלים', 'עמוד ראשי': 'עמוד ראשי' };
function confirm(title) {
  if (title === 'מרקורי') {
    const error = new Error('disambiguation');
    error.code = 'disambiguation';
    return Promise.reject(error);
  }
  if (!ARTICLES[title]) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    return Promise.reject(error);
  }
  return Promise.resolve(ARTICLES[title]);
}
const linked = async () => ({ out: true, in: true });

async function problem(start, goal, links = linked) {
  try {
    await checkCustomPair(start, goal, { confirm, links });
  } catch (error) {
    return { field: error.field, message: error.message };
  }
  return null;
}

test('a good pair comes back with the real titles', async () => {
  assert.deepEqual(await checkCustomPair(' חתולים ', 'ירושלים', { confirm, links: linked }), { start: 'חתול', goal: 'ירושלים' });
});

test('empty, missing and disambiguation titles are turned down on their own field', async () => {
  assert.equal((await problem('', 'כלב')).field, 'start');
  assert.equal((await problem('חתול', '')).field, 'goal');
  assert.deepEqual(await problem('אין כזה', 'כלב'), { field: 'start', message: 'אין ערך בשם הזה בוויקיפדיה.' });
  assert.equal((await problem('חתול', 'מרקורי')).message, 'זה דף פירושונים. בחרו ערך מדויק יותר.');
  assert.equal((await problem('עמוד ראשי', 'כלב')).field, 'start');
});

test('the same article twice is turned down, also through a redirect', async () => {
  const result = await problem('חתולים', 'חתול');
  assert.equal(result.field, 'pair');
  assert.match(result.message, /אותו ערך/);
});

test('a dead end start or an unreachable goal is turned down', async () => {
  assert.equal((await problem('חתול', 'כלב', async () => ({ out: false, in: true }))).field, 'start');
  assert.equal((await problem('חתול', 'כלב', async () => ({ out: true, in: false }))).field, 'goal');
});

test('when the link check cannot run the pair is still allowed', async () => {
  const result = await checkCustomPair('חתול', 'כלב', { confirm, links: async () => { throw new Error('offline'); } });
  assert.deepEqual(result, { start: 'חתול', goal: 'כלב' });
});

test('when Wikipedia cannot be reached the player is told to try again', async () => {
  const result = await problem('חתול', 'כלב');
  assert.equal(result, null);
  const offline = await (async () => {
    try {
      await checkCustomPair('חתול', 'כלב', { confirm: async () => { throw new Error('network'); }, links: linked });
    } catch (error) {
      return error;
    }
    return null;
  })();
  assert.equal(offline.field, 'pair');
});

test('free game kinds', () => {
  assert.deepEqual(FREE_KINDS, ['random', 'easy', 'custom']);
  assert.equal(cleanFreeKind('easy'), 'easy');
  assert.equal(cleanFreeKind('custom'), 'custom');
  assert.equal(cleanFreeKind('weird'), 'random');
  assert.equal(cleanFreeKind(undefined), 'random');
});

test('a disambiguation page is spotted even though the API marks it with an empty string', async () => {
  const { isDisambiguation } = await import('../src/wikiBot.js');
  assert.equal(isDisambiguation({ title: 'מרקורי', pageprops: { disambiguation: '' } }), true);
  assert.equal(isDisambiguation({ title: 'חתול', pageprops: {} }), false);
  assert.equal(isDisambiguation({ title: 'חתול' }), false);
});
