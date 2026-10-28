import { loadLocalScores } from './localScores.js';

// How many games this player has started (daily and free; the tutorial never counts), and whether
// they saw the tutorial. Kept on the device. For a signed-in player the home screen also tells it
// how many saved results the account has, so a player on a new phone isn't treated as new.
const COUNT_KEY = 'wikigame.gamesPlayed';
const TUTORIAL_KEY = 'wikigame.tutorialSeen';

// "קרא את ערך היעד" shows in the first three games counted by HINT_KEY. That counter started
// fresh with the release that brought the hint (v2), so players who were already playing get it in
// their next three games too. It is kept on this device only: a signed-in player on a new phone
// simply sees the small link for three more games there, which does no harm.
export const HINT_GAMES = 3;
const HINT_KEY = 'wikigame.hintGames.v2';

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

function hintCount() {
  const value = Number.parseInt(read(HINT_KEY), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// The number of the game in progress, as the hint counts it (for a game opened again after a reload).
export function currentHintGame() {
  return hintCount();
}

// A new game started (daily or free; never the tutorial). Returns its number as the hint counts
// it: 1 for the first game since the hint arrived.
export function countNewGame() {
  write(COUNT_KEY, String(gamesPlayed() + 1));
  const next = hintCount() + 1;
  write(HINT_KEY, String(next));
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
