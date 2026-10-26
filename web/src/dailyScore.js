import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { loadLocalScores, removeLocalScores, saveLocalScore } from './localScores';
import { israelDateKey } from './wikipedia';
import { timestampMillis } from './time';

// One daily row per player per Israel day, holding their best result of that day. The document id
// carries the player and the day (Firestore rules enforce the same id), and a replay replaces the
// row only when it is better.
export function dailyScoreId(uid, dayKey) {
  return `daily_${uid}_${dayKey}`;
}

// Fewer pages wins; on equal pages the faster time wins.
export function betterScore(next, prev) {
  if (!prev) return true;
  const pages = Number(next?.pagesVisited);
  const prevPages = Number(prev.pagesVisited);
  if (pages !== prevPages) return pages < prevPages;
  return Number(next?.timeTaken) < Number(prev.timeTaken);
}

// Saves the player's daily result for dayKey, or improves the saved one.
// Returns { id, kept, improved }: kept means an earlier result that day is at least as good.
export async function saveDailyScore(uid, dayKey, data) {
  const id = dailyScoreId(uid, dayKey);
  const ref = doc(db, 'scores', id);
  const outcome = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      transaction.set(ref, { ...data, uid, mode: 'daily', dayKey });
      return 'saved';
    }
    if (!betterScore(data, snap.data())) return 'kept';
    transaction.update(ref, {
      name: data.name,
      pagesVisited: data.pagesVisited,
      timeTaken: data.timeTaken,
      timestamp: data.timestamp,
      path: data.path,
    });
    return 'improved';
  });
  return { id, kept: outcome === 'kept', improved: outcome === 'improved' };
}

export function rowDayKey(row) {
  if (typeof row?.dayKey === 'string' && row.dayKey) return row.dayKey;
  const millis = timestampMillis(row?.timestamp);
  return millis ? israelDateKey(new Date(millis)) : '';
}

// This device's best daily result for the given day, if a guest already finished one.
export function localDailyOn(dayKey) {
  return loadLocalScores()
    .filter((row) => row.mode === 'daily' && rowDayKey(row) === dayKey)
    .reduce((best, row) => (betterScore(row, best) ? row : best), null);
}

// Keeps one daily row per day on this device: the new result replaces the day's rows only if better.
// Returns { row, kept, improved }.
export function saveLocalDaily(score) {
  const earlier = localDailyOn(score.dayKey);
  if (earlier && !betterScore(score, earlier)) return { row: earlier, kept: true, improved: false };
  removeLocalScores((row) => row.mode === 'daily' && rowDayKey(row) === score.dayKey);
  return { row: saveLocalScore(score), kept: false, improved: Boolean(earlier) };
}
