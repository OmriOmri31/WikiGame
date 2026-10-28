// Run with: npm test (from web/). Article loading: time limit, one retry, Retry-After, always settles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchArticle } from '../src/wikipedia.js';

const ok = (title = 'ירושלים') => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({ parse: { title, text: { '*': '<p>שלום</p>' } } }),
});
const status = (code, headers = {}) => ({
  ok: false,
  status: code,
  headers: new Headers(headers),
  json: async () => ({}),
});
// A request that never answers until it is aborted, like a stalled phone connection.
const stalled = (url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
});

test('a stalled request times out and the retry loads the article', async () => {
  let calls = 0;
  const waits = [];
  const article = await fetchArticle('ירושלים', {
    timeoutMs: 30,
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: (url, init) => { calls += 1; return calls === 1 ? stalled(url, init) : Promise.resolve(ok()); },
  });
  assert.equal(article.title, 'ירושלים');
  assert.equal(calls, 2);
  assert.equal(waits.length, 1);
});

test('two stalled requests end in a timeout error instead of waiting forever', async () => {
  let calls = 0;
  const started = Date.now();
  await assert.rejects(
    fetchArticle('ירושלים', { timeoutMs: 30, sleep: async () => {}, fetchImpl: (u, i) => { calls += 1; return stalled(u, i); } }),
    (error) => error.code === 'timeout',
  );
  assert.equal(calls, 2);
  assert.ok(Date.now() - started < 2000);
});

test('429 waits for Retry-After (capped) before the one retry', async () => {
  const waits = [];
  let calls = 0;
  const article = await fetchArticle('ירושלים', {
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls += 1; return calls === 1 ? status(429, { 'Retry-After': '2' }) : ok(); },
  });
  assert.equal(article.title, 'ירושלים');
  assert.deepEqual(waits, [2000]);

  waits.length = 0;
  calls = 0;
  await fetchArticle('ירושלים', {
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls += 1; return calls === 1 ? status(429, { 'Retry-After': '120' }) : ok(); },
  });
  assert.deepEqual(waits, [5000]);
});

test('a network failure is retried once, then reported', async () => {
  let calls = 0;
  await assert.rejects(
    fetchArticle('ירושלים', { sleep: async () => {}, fetchImpl: async () => { calls += 1; throw new TypeError('Load failed'); } }),
    (error) => error.code === 'network',
  );
  assert.equal(calls, 2);
});

test('a missing article is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    fetchArticle('אין כזה', {
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ error: { code: 'missingtitle', info: 'missing' } }) };
      },
    }),
    (error) => error.code === 'missingtitle',
  );
  assert.equal(calls, 1);
});

test('a 404 is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    fetchArticle('ירושלים', { sleep: async () => {}, fetchImpl: async () => { calls += 1; return status(404); } }),
  );
  assert.equal(calls, 1);
});

test('the CSP hash matches the inline theme script in index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  const hash = `sha256-${createHash('sha256').update(scripts[0]).digest('base64')}`;
  const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  assert.ok(toml.includes(`'${hash}'`), `netlify.toml needs '${hash}'`);
  assert.ok(!toml.includes("'unsafe-inline'"));
});

// A category page (e.g. "קטגוריה:בוגרי ישיבת חברון כנסת ישראל") has no text of its own: the parsed
// page is an empty parser-output div. Its pages and subcategories come from list=categorymembers.
test('a category page gets its members as playable links', async () => {
  const category = 'קטגוריה:בוגרי ישיבת חברון כנסת ישראל';
  const emptyParse = '<div class="mw-content-rtl mw-parser-output" lang="he" dir="rtl">\n<!-- NewPP limit report -->\n</div>';
  const urls = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    urls.push(params);
    if (params.get('action') === 'parse') {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ parse: { title: category, text: { '*': emptyParse } } }) };
    }
    const first = !params.get('cmcontinue');
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => (first
        ? {
          continue: { cmcontinue: 'page|next', continue: '-||' },
          query: {
            categorymembers: [
              { ns: 0, title: 'ישיבת חברון כנסת ישראל' },
              { ns: 14, title: 'קטגוריה:ראשי ישיבת חברון' },
              { ns: 6, title: 'קובץ:תמונה.jpg' },
            ],
          },
        }
        : { query: { categorymembers: [{ ns: 0, title: 'אברהם אבידן' }] } }),
    };
  };
  const article = await fetchArticle(category, { fetchImpl });
  assert.equal(article.title, category);
  const members = urls.filter((params) => params.get('list') === 'categorymembers');
  assert.equal(members.length, 2);
  assert.equal(members[0].get('cmtitle'), category);
  assert.equal(members[1].get('cmcontinue'), 'page|next');
  assert.match(article.html, /<h2>קטגוריות משנה<\/h2>/);
  assert.match(article.html, /<h2>דפים בקטגוריה &quot;בוגרי ישיבת חברון כנסת ישראל&quot;<\/h2>/);
  const link = (title) => `href="/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}"`;
  assert.ok(article.html.includes(link('ישיבת חברון כנסת ישראל')));
  assert.ok(article.html.includes(link('אברהם אבידן')));
  assert.ok(article.html.includes(`${link('קטגוריה:ראשי ישיבת חברון')} title="קטגוריה:ראשי ישיבת חברון">ראשי ישיבת חברון</a>`));
  assert.ok(!article.html.includes('קובץ'));
});

test('an ordinary article does not ask for category members', async () => {
  const urls = [];
  await fetchArticle('ירושלים', { fetchImpl: async (url) => { urls.push(url); return ok(); } });
  assert.equal(urls.length, 1);
});
