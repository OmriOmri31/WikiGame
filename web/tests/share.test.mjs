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
