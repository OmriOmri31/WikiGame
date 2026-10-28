// Run with: npm test (from web/). The easy free game's article pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawEasyPair, easyTitles, loadEasyPool, resetEasyPoolForTests } from '../src/easyPool.js';

const pool = JSON.parse(readFileSync(new URL('../public/easy-pool.json', import.meta.url), 'utf8'));

test('the shipped pool is large, varied and clean', () => {
  const titles = easyTitles(pool);
  assert.ok(titles.length >= 1000, `only ${titles.length} titles`);
  assert.equal(pool.count, Object.values(pool.kinds).flat().length);
  for (const kind of ['place', 'people', 'screen', 'sport', 'culture']) {
    assert.ok(pool.kinds[kind]?.length >= 20, `few ${kind} titles`);
  }
  for (const title of titles) {
    assert.ok(!/^\d/.test(title), title);
    assert.ok(!/(מלחמ|טבח|פיגוע|רצח|טרור|השואה|אונס|סקס|פורנ)/.test(title), title);
  }
  for (const known of ['ישראל', 'צרפת', 'חיפה', 'גל גדות', 'משפחת סימפסון', 'פסח']) {
    assert.ok(titles.includes(known), known);
  }
});

test('titles are cleaned and repeated ones dropped', () => {
  const titles = easyTitles({ kinds: { a: ['חתול', ' חתול ', 'כלב', '', 'משתמש:מישהו', 5], b: 'not a list' } });
  assert.deepEqual(titles, ['חתול', 'כלב']);
  assert.deepEqual(easyTitles(null), []);
});

test('a draw gives two different titles, and not the same pair twice in a row', () => {
  const titles = ['א', 'ב', 'ג', 'ד'];
  let previous = '';
  for (let run = 0; run < 50; run += 1) {
    const { start, goal } = drawEasyPair(titles);
    assert.notEqual(start, goal);
    assert.ok(titles.includes(start) && titles.includes(goal));
    const key = `${start}|${goal}`;
    assert.notEqual(key, previous);
    previous = key;
  }
  assert.throws(() => drawEasyPair(['א']));
});

test('the pool is fetched once, and again after a failure', async () => {
  resetEasyPoolForTests();
  let calls = 0;
  const failing = async () => { calls += 1; return { ok: false }; };
  await assert.rejects(loadEasyPool(failing));
  const working = async (url) => {
    calls += 1;
    assert.equal(url, '/easy-pool.json');
    return { ok: true, json: async () => ({ kinds: { x: ['חתול', 'כלב'] } }) };
  };
  assert.deepEqual(await loadEasyPool(working), ['חתול', 'כלב']);
  assert.deepEqual(await loadEasyPool(working), ['חתול', 'כלב']);
  assert.equal(calls, 2);
  resetEasyPoolForTests();
});
