// Run with: npm test (from web/). The home screen's background load of today's daily articles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prefetchDailyStart } from '../src/dailyStart.js';
import { clearArticleCache, peekArticle, preparedHtml, sharedArticle } from '../src/articleCache.js';

const snap = (data) => ({ exists: () => Boolean(data), data: () => data });
// 12:00 in Israel on 28 October 2026.
const NOON = () => new Date('2026-10-28T10:00:00Z');
const todayDoc = {
  startArticleTitle: 'ירושלים',
  targetArticleTitle: 'תל אביב-יפו',
  timestamp: Date.parse('2026-10-27T22:00:00Z'),
  lotteryDateKey: '2026-10-28',
  next: { dateKey: '2026-10-29', startArticleTitle: 'חיפה', targetArticleTitle: 'עכו', timestamp: 0 },
};

function run(data, extra = {}) {
  const shared = [];
  const result = prefetchDailyStart({
    readDoc: async () => snap(data),
    resolveStart: async (start) => start,
    now: NOON,
    share: async (title) => { shared.push(title); return { title, html: '' }; },
    prepare: () => '',
    idle: (task) => task(),
    saveData: false,
    ...extra,
  });
  return result.then((titles) => ({ titles, shared }));
}

test('loads today\'s live pair, start first', async () => {
  const { titles, shared } = await run(todayDoc);
  assert.deepEqual(titles, ['ירושלים', 'תל אביב-יפו']);
  assert.deepEqual(shared, ['ירושלים', 'תל אביב-יפו']);
});

test('never loads the next day\'s pair staged in the evening', async () => {
  const { shared } = await run(todayDoc);
  assert.ok(!shared.includes('חיפה') && !shared.includes('עכו'));
});

test('after midnight the staged pair is today\'s, and it is the one loaded', async () => {
  const { shared } = await run(todayDoc, { now: () => new Date('2026-10-28T23:30:00Z') });
  assert.deepEqual(shared, ['חיפה', 'עכו']);
});

test('loads nothing for an old pair, a missing document, or data saver', async () => {
  const old = { ...todayDoc, lotteryDateKey: '2026-10-27', timestamp: Date.parse('2026-10-26T22:00:00Z'), next: null };
  assert.deepEqual((await run(old)).shared, []);
  assert.deepEqual((await run(null)).shared, []);
  assert.deepEqual((await run(todayDoc, { saveData: true })).shared, []);
});

test('one request per article, shared by the home screen and the game', async () => {
  clearArticleCache();
  let calls = 0;
  const fetchImpl = async (title) => { calls += 1; return { title, html: '<p>x</p>' }; };
  assert.equal(peekArticle('ירושלים'), null);
  const first = sharedArticle('ירושלים', { fetchImpl });
  const second = sharedArticle('ירושלים', { fetchImpl });
  assert.equal(first, second);
  assert.equal(peekArticle('ירושלים'), first);
  await first;
  assert.equal(calls, 1);
  clearArticleCache();
});

test('a failed request is dropped, so the game asks again', async () => {
  clearArticleCache();
  const failing = sharedArticle('חיפה', { fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(failing);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peekArticle('חיפה'), null);
});

test('an old request is not reused', async () => {
  clearArticleCache();
  const at = Date.now() - 16 * 60 * 1000;
  const old = sharedArticle('יפו', { fetchImpl: async (title) => ({ title, html: '' }), now: at });
  await old;
  assert.equal(peekArticle('יפו'), null);
  clearArticleCache();
});

test('the HTML of an article is prepared once', () => {
  let runs = 0;
  const article = { title: 'א', html: '<p>א</p>' };
  const prepare = (html) => { runs += 1; return html.toUpperCase(); };
  assert.equal(preparedHtml(article, prepare), '<P>א</P>');
  assert.equal(preparedHtml(article, prepare), '<P>א</P>');
  assert.equal(runs, 1);
});
