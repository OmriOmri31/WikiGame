import { loadLocalScores } from './localScores.js';

// How many games this player has started (daily and free; the tutorial never counts), and whether
// they saw the tutorial. Kept on the device. For a signed-in player the home screen also tells it
// how many saved results the account has, so a player on a new phone isn't treated as new.
const COUNT_KEY = 'wikigame.gamesPlayed';
const TUTORIAL_KEY = 'wikigame.tutorialSeen';

// "קרא את ערך היעד" shows in the first three games.
export const HINT_GAMES = 3;

function read(key) {
  try {
    return globalThis.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage can be off (private mode). The count then starts over next visit.
  }
}

function storedCount() {
  const value = Number.parseInt(read(COUNT_KEY), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function gamesPlayed() {
  return Math.max(storedCount(), loadLocalScores().length);
}

// The account (or another source) knows of `count` games: never count below that.
export function noteKnownGames(count) {
  const value = Math.floor(Number(count) || 0);
  if (value > storedCount()) write(COUNT_KEY, String(value));
}

// A new game started. Returns its number (1 for the first game).
export function countNewGame() {
  const next = gamesPlayed() + 1;
  write(COUNT_KEY, String(next));
  return next;
}

export function showsTargetHint(gameNumber) {
  return gameNumber >= 1 && gameNumber <= HINT_GAMES;
}

export function tutorialSeen() {
  return read(TUTORIAL_KEY) === '1';
}

export function markTutorialSeen() {
  write(TUTORIAL_KEY, '1');
}

// The tutorial opens by itself before a player's very first game.
export function needsTutorial() {
  return !tutorialSeen() && gamesPlayed() === 0;
}
