import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from './firebase';
import { loadLocalScores } from './localScores';
import { israelDateKey } from './wikipedia';
import { timestampMillis } from './time';

// The last result a guest finished, waiting to be moved to an account after sign-in.
const PENDING_KEY = 'wikigame.pendingGuestResult';
const LOCAL_KEY = 'wikigame.localScores';

export function rememberGuestResult(id) {
  try { localStorage.setItem(PENDING_KEY, id); } catch {}
}

export function pendingGuestResultId() {
  try { return localStorage.getItem(PENDING_KEY) || ''; } catch { return ''; }
}

function forget() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

function dropLocalRow(id) {
  try {
    const next = loadLocalScores().filter((row) => row.id !== id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Save the pending guest result to the signed-in player's account, once.
 * Daily results count only on the same Israel date, and only if the player has no daily score
 * that day yet. An existing account result always wins over a guest one.
 * Returns 'saved', 'skipped' or 'none'.
 */
let inFlight = null;

export function claimGuestResult(user, nickname) {
  if (!inFlight) inFlight = claimOnce(user, nickname).finally(() => { inFlight = null; });
  return inFlight;
}

async function claimOnce(user, nickname) {
  const id = pendingGuestResultId();
  if (!id || !user?.uid) return 'none';
  const row = loadLocalScores().find((entry) => entry.id === id);
  if (!row) {
    forget();
    return 'none';
  }
  const playedAt = timestampMillis(row.timestamp) || Date.now();
  if (row.mode === 'daily') {
    const today = israelDateKey(new Date());
    if (israelDateKey(new Date(playedAt)) !== today) {
      forget();
      return 'skipped';
    }
    const mine = await getDocs(query(collection(db, 'scores'), where('uid', '==', user.uid)));
    const hasDaily = mine.docs.some((entry) => {
      const data = entry.data();
      return data.mode !== 'free'
        && israelDateKey(new Date(timestampMillis(data.timestamp))) === today;
    });
    if (hasDaily) {
      forget();
      return 'skipped';
    }
  }
  forget();
  await addDoc(collection(db, 'scores'), {
    uid: user.uid,
    name: nickname || user.displayName || 'שחקן',
    pagesVisited: row.pagesVisited,
    timeTaken: row.timeTaken,
    timestamp: Timestamp.fromMillis(playedAt),
    mode: row.mode,
    startTitle: row.startTitle,
    goalTitle: row.goalTitle,
    path: row.path,
    ...(Array.isArray(row.fastestPath) ? { fastestPath: row.fastestPath } : {}),
    ...(row.gaveUp ? { gaveUp: true } : {}),
  });
  dropLocalRow(id);
  return 'saved';
}
