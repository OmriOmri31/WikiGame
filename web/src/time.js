export function timestampMillis(stamp) {
  if (!stamp) return 0;
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  return 0;
}

export function formatScoreDate(stamp) {
  const millis = timestampMillis(stamp);
  if (!millis) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(millis));
}

function pad(value, size) {
  return String(value).padStart(size, '0');
}

/**
 * Hours are omitted while they are 0.
 * Milliseconds use three digits when shown; the live timer hides them.
 */
export function formatDuration(value, { milliseconds = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '—';

  const totalMs = Math.round(number * 1000);
  const remainderMs = totalMs % 1000;
  const totalSeconds = milliseconds ? Math.floor(totalMs / 1000) : Math.floor(number);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = milliseconds
    ? `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(remainderMs, 3)}`
    : `${pad(minutes, 2)}:${pad(seconds, 2)}`;
  if (hours > 0) return `${pad(hours, 2)}:${clock}`;
  return clock;
}
