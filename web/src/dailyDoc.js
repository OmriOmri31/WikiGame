import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// The home screen starts reading the daily document, so "משחק יומי" can use that read instead
// of waiting for a new one. The game still picks the live pair from it at the moment it starts
// (liveDailyPair with the current time), so nothing is shown earlier than before.
const FRESH_MS = 30000;

let cached = null;

export function readDailyDoc() {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.promise;
  const promise = getDoc(doc(db, 'daily', 'articles'));
  cached = { at: Date.now(), promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

export function prefetchDailyDoc() {
  readDailyDoc().catch(() => {});
}

// Today's pair, as this device already opened it. Used only to start loading the two articles
// while the daily document is read; the game checks them against that document before using them.
const SEEN_KEY = 'wikigame.dailySeen';

export function seenDailyPair(todayKey) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY) || 'null');
    if (!parsed || parsed.dateKey !== todayKey) return null;
    if (typeof parsed.start !== 'string' || typeof parsed.goal !== 'string') return null;
    if (!parsed.start || !parsed.goal) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rememberDailyPair(dateKey, start, goal) {
  if (!dateKey || !start || !goal) return;
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify({ dateKey, start, goal }));
  } catch {
    // Storage can be full or blocked; the next start simply waits for the read.
  }
}
