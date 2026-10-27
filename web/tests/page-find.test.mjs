// Run with: npm test (from web/). In-game find: how matches are counted in a text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MATCH_LIMIT, matchOffsets } from '../src/pageFind.js';

test('finds every match, without overlaps', () => {
  assert.deepEqual(matchOffsets('שלום שלום ושלום', 'שלום'), [0, 5, 11]);
  assert.deepEqual(matchOffsets('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(matchOffsets('אין כאן', 'ישראל'), []);
  assert.deepEqual(matchOffsets('טקסט', ''), []);
});

test('stops at the limit it is given', () => {
  const text = 'א '.repeat(MATCH_LIMIT + 50);
  assert.equal(matchOffsets(text, 'א').length, MATCH_LIMIT);
  assert.deepEqual(matchOffsets('א א א', 'א', 2), [0, 2]);
  assert.deepEqual(matchOffsets('א א א', 'א', 0), []);
});

// The game used to rewrite every article (hidden characters between letters, <mark> wrappers)
// and allowed find on one page per game. Both are gone; this keeps them from coming back.
test('search is not limited to one page and articles are not rewritten', () => {
  const game = readFileSync(new URL('../src/screens/GameScreen.jsx', import.meta.url), 'utf8');
  const tools = readFileSync(new URL('../src/GameTools.jsx', import.meta.url), 'utf8');
  const find = readFileSync(new URL('../src/pageFind.js', import.meta.url), 'utf8');
  assert.doesNotMatch(game, /findGuard|guardText|searchTitle|זמין רק בדף אחד/);
  assert.doesNotMatch(tools, /searchDisabled|זמין רק בדף אחד/);
  assert.doesNotMatch(find, /surroundContents|createElement\('mark'\)|\\uE000/);
});
