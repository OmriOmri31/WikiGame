import { israelDateKey } from './wikipedia.js';
import { timestampMillis } from './time.js';

// The first instant of an Israel calendar day (handles the DST switch).
export function israelMidnightMs(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  let low = Date.UTC(year, month - 1, day) - 4 * 60 * 60 * 1000;
  let high = low + 6 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (israelDateKey(new Date(mid)) >= dateKey) high = mid;
    else low = mid;
  }
  return high;
}

function stampOf(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return timestampMillis(value);
}

// The pair that is live right now. The publish job stages tomorrow's pair in `next` during the
// evening, so the new pair (and its bot scores, stamped at 00:00) go live exactly at midnight
// even when the scheduled job itself starts late.
export function liveDailyPair(data, now = new Date()) {
  const today = israelDateKey(now);
  const next = data?.next;
  if (next && next.dateKey === today && next.startArticleTitle && next.targetArticleTitle) {
    return {
      start: next.startArticleTitle,
      goal: next.targetArticleTitle,
      stamp: stampOf(next.timestamp) || israelMidnightMs(today),
      dateKey: today,
      live: true,
    };
  }
  const stamp = stampOf(data?.timestamp);
  const dateKey = data?.lotteryDateKey || (stamp ? israelDateKey(new Date(stamp)) : '');
  return {
    start: data?.startArticleTitle || '',
    goal: data?.targetArticleTitle || '',
    stamp,
    dateKey,
    live: Boolean(stamp) && dateKey === today,
  };
}

export function scoreDateKey(row) {
  if (typeof row?.dayKey === 'string' && row.dayKey) return row.dayKey;
  const millis = timestampMillis(row?.timestamp);
  return millis ? israelDateKey(new Date(millis)) : '';
}
