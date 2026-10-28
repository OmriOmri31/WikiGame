// Run with: npm test (from web/). Checks the shared result text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, resultSquares, SITE_URL } from '../src/share.js';

test('daily share text has no article names', () => {
  const row = {
    mode: 'daily', dayKey: '2026-10-27', pagesVisited: 7, timeTaken: 140.5,
    startTitle: 'דיקטטורה', goalTitle: 'חורבן בית המקדש', path: ['דיקטטורה', 'רומא', 'חורבן בית המקדש'],
  };
  const text = buildShareText(row);
  assert.equal(text, [
    'המשחק היומי ב־WikiWiki · 27.10.2026',
    '🟦🟦🟦🟦🟦🟦🟩',
    'הגעתי ליעד ב־7 דפים, בזמן 02:20',
    SITE_URL,
  ].join('\n'));
  for (const title of [...row.path, row.startTitle, row.goalTitle]) assert.ok(!text.includes(title));
});

test('free share text names the pair', () => {
  const text = buildShareText({ mode: 'free', pagesVisited: 4, timeTaken: 65, startTitle: 'ירושלים', goalTitle: 'חתול' });
  assert.equal(text, [
    'משחק חופשי ב־WikiWiki',
    'ירושלים ← חתול',
    '🟦🟦🟦🟩',
    'הגעתי ליעד ב־4 דפים, בזמן 01:05',
    SITE_URL,
  ].join('\n'));
});

test('long games are cut short and missing data is handled', () => {
  assert.equal(resultSquares(30), `${'🟦'.repeat(19)}…🟩`);
  assert.equal(resultSquares(1), '🟩');
  const text = buildShareText({ mode: 'daily', pagesVisited: 1 });
  assert.equal(text, ['המשחק היומי ב־WikiWiki', '🟩', 'הגעתי ליעד בדף אחד', SITE_URL].join('\n'));
});

test('a free game on a pair the player chose says so', async () => {
  const { buildShareText: build } = await import('../src/share.js');
  const text = build({ mode: 'free', freeKind: 'custom', pagesVisited: 2, timeTaken: 5, startTitle: 'חתול', goalTitle: 'כלב' });
  assert.equal(text.split('\n')[0], 'משחק חופשי ב־WikiWiki · זוג שבחרתי');
});

test('the app invitation is short Hebrew with the production link', async () => {
  const { buildAppShareText } = await import('../src/share.js');
  const text = buildAppShareText();
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^בואו לשחק ב־WikiWiki/);
  assert.equal(lines[1], 'https://wikiwiki-game.netlify.app');
  assert.equal(SITE_URL, 'https://wikiwiki-game.netlify.app');
});

test('sharing uses the share sheet when there is one, otherwise copies', async () => {
  const { shareApp } = await import('../src/share.js');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    let shared = null;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { share: async (data) => { shared = data; } } });
    assert.equal(await shareApp(), 'shared');
    assert.match(shared.text, /wikiwiki-game\.netlify\.app/);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { share: async () => { const error = new Error('no'); error.name = 'AbortError'; throw error; } },
    });
    assert.equal(await shareApp(), 'cancelled');

    let copied = '';
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => { copied = text; } } } });
    assert.equal(await shareApp(), 'copied');
    assert.match(copied, /^בואו לשחק/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});
