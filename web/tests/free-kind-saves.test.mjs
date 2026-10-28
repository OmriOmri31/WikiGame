// Run with: npm test (from web/). The free game's kind is kept with saved games and results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers-storage.mjs';
import { loadGameSession, saveGameSession } from '../src/gameSession.js';
import { loadLocalScores, saveLocalScore } from '../src/localScores.js';

const session = {
  startTitle: 'חתול', goalTitle: 'כלב', currentTitle: 'חתול', path: ['חתול'], backUses: 3, elapsedMs: 1000,
};

test('a saved free game remembers its kind', () => {
  installStorage();
  saveGameSession({ ...session, mode: 'free', freeKind: 'easy' });
  assert.equal(loadGameSession().freeKind, 'easy');
  saveGameSession({ ...session, mode: 'free', freeKind: 'nonsense' });
  assert.equal(loadGameSession().freeKind, undefined);
  saveGameSession({ ...session, mode: 'daily', freeKind: 'custom' });
  assert.equal(loadGameSession().freeKind, undefined);
});

test('a tutorial is never saved as a game to come back to', () => {
  installStorage();
  saveGameSession({ ...session, mode: 'tutorial' });
  assert.equal(loadGameSession(), null);
});

test('guest free results keep their kind; daily ones never have one', () => {
  installStorage();
  const base = { pagesVisited: 2, timeTaken: 9, startTitle: 'חתול', goalTitle: 'כלב', path: ['חתול', 'כלב'] };
  saveLocalScore({ ...base, mode: 'free', freeKind: 'custom' });
  saveLocalScore({ ...base, mode: 'daily', dayKey: '2026-10-28', freeKind: 'custom' });
  saveLocalScore({ ...base, mode: 'free', freeKind: 'bad' });
  const [bad, daily, custom] = loadLocalScores();
  assert.equal(custom.freeKind, 'custom');
  assert.equal(daily.freeKind, undefined);
  assert.equal(bad.freeKind, undefined);
});
