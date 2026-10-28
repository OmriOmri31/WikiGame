import { formatDuration, timestampMillis } from './time.js';

// The public address that goes into every shared result.
export const SITE_URL = 'https://wikiwiki-game.netlify.app';

const MAX_SQUARES = 20;

function israelDayKey(millis) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(millis));
}

// '2026-10-27' -> '27.10.2026'
function shownDate(row) {
  let key = typeof row?.dayKey === 'string' ? row.dayKey : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const millis = timestampMillis(row?.timestamp);
    key = millis ? israelDayKey(millis) : '';
  }
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}.${month}.${year}`;
}

// One square per page, the last one (the goal) green. Long games are cut short with "…".
export function resultSquares(pages) {
  const count = Math.max(1, Math.floor(Number(pages) || 1));
  if (count > MAX_SQUARES) return `${'🟦'.repeat(MAX_SQUARES - 1)}…🟩`;
  return `${'🟦'.repeat(count - 1)}🟩`;
}

function scoreLine(row) {
  const pages = Math.max(1, Math.floor(Number(row?.pagesVisited) || 1));
  const pageWord = pages === 1 ? 'בדף אחד' : `ב־${pages} דפים`;
  const time = Number.isFinite(Number(row?.timeTaken)) && row?.timeTaken !== null && row?.timeTaken !== undefined
    ? formatDuration(row.timeTaken, { milliseconds: false })
    : '';
  return time && time !== '—' ? `הגעתי ליעד ${pageWord}, בזמן ${time}` : `הגעתי ליעד ${pageWord}`;
}

// The text a player shares. The daily game never names its articles, so nobody gets a spoiler.
// A free game is the player's own pair, so its start and goal are part of the fun.
export function buildShareText(row, siteUrl = SITE_URL) {
  const lines = [];
  if (row?.mode === 'free') {
    // A pair the player chose says so, since the player may have picked an easy one.
    lines.push(row.freeKind === 'custom' ? 'משחק חופשי ב־WikiWiki · זוג שבחרתי' : 'משחק חופשי ב־WikiWiki');
    if (row.startTitle && row.goalTitle) lines.push(`${row.startTitle} ← ${row.goalTitle}`);
  } else {
    const date = shownDate(row);
    lines.push(date ? `המשחק היומי ב־WikiWiki · ${date}` : 'המשחק היומי ב־WikiWiki');
  }
  lines.push(resultSquares(row?.pagesVisited));
  lines.push(scoreLine(row));
  lines.push(siteUrl);
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the older way below.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

// The invitation the home screen's share button sends.
export function buildAppShareText(siteUrl = SITE_URL) {
  return [
    'בואו לשחק ב־WikiWiki: מגיעים מערך לערך בוויקיפדיה רק דרך הקישורים. כל יום זוג חדש.',
    siteUrl,
  ].join('\n');
}

// Opens the system share sheet when there is one, otherwise copies the text.
// Returns 'shared', 'copied', 'cancelled' or 'failed'.
export async function shareText(text) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function shareResult(row) {
  return shareText(buildShareText(row));
}

export function shareApp() {
  return shareText(buildAppShareText());
}
