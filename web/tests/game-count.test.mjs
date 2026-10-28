// Run with: npm test (from web/). The games counter behind "קרא את ערך היעד" and the tutorial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers-storage.mjs';
import {
  HINT_GAMES, countNewGame, gamesPlayed, markTutorialSeen, needsTutorial, noteKnownGames, showsTargetHint, tutorialSeen,
} from '../src/gameCount.js';
import { saveLocalScore } from '../src/localScores.js';

test('the hint shows in the first three games only', () => {
  installStorage();
  assert.equal(HINT_GAMES, 3);
  const shown = [1, 2, 3, 4, 5].map(() => showsTargetHint(countNewGame()));
  assert.deepEqual(shown, [true, true, true, false, false]);
  assert.equal(showsTargetHint(0), false);
});

test('a new player needs the tutorial until they saw it', () => {
  installStorage();
  assert.equal(gamesPlayed(), 0);
  assert.equal(needsTutorial(), true);
  markTutorialSeen();
  assert.equal(tutorialSeen(), true);
  assert.equal(needsTutorial(), false);
});

test('a player who already played is not sent to the tutorial', () => {
  installStorage();
  countNewGame();
  assert.equal(needsTutorial(), false);
});

test('saved guest results and account results count as games played', () => {
  installStorage();
  saveLocalScore({ mode: 'free', pagesVisited: 3, timeTaken: 20, startTitle: 'א', goalTitle: 'ב', path: ['א', 'ב'] });
  saveLocalScore({ mode: 'free', pagesVisited: 3, timeTaken: 20, startTitle: 'א', goalTitle: 'ב', path: ['א', 'ב'] });
  assert.equal(gamesPlayed(), 2);
  noteKnownGames(7);
  assert.equal(gamesPlayed(), 7);
  noteKnownGames(1);
  assert.equal(gamesPlayed(), 7);
  assert.equal(showsTargetHint(countNewGame()), false);
});

test('without storage the game still works', () => {
  delete globalThis.localStorage;
  assert.equal(gamesPlayed(), 0);
  assert.equal(countNewGame(), 1);
  assert.equal(tutorialSeen(), false);
});
