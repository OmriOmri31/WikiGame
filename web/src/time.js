export function timestampMillis(stamp) {
  if (!stamp) return 0;
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  return 0;
}

function pad(value, size) {
  return String(value).padStart(size, '0');
}

/** Hours are omitted while they are 0. Milliseconds always use three digits. */
export function formatDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '—';

  const totalMs = Math.round(number * 1000);
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
  if (hours > 0) return `${pad(hours, 2)}:${clock}`;
  return clock;
}
