import { isBlockedNickname } from './blockedNames.js';
import { isReservedPlayerName } from './account.js';

// Nickname rules shared by every place a nickname is picked. firestore.rules enforces the same
// length and characters for new nicknames; the blocked-word check runs here only.
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 9;
// Words of letters, digits and - _ =, with single spaces between them.
const ALLOWED = /^[A-Za-z0-9\u05D0-\u05EA_=-]+( [A-Za-z0-9\u05D0-\u05EA_=-]+)*$/;

export const NICKNAME_ERRORS = {
  empty: 'יש להזין כינוי.',
  short: 'הכינוי קצר מדי. נדרשים לפחות 2 תווים.',
  long: 'הכינוי ארוך מדי. אפשר עד 9 תווים, כולל רווחים.',
  chars: 'אפשר להשתמש רק באותיות, במספרים, ברווח, במקף (-), בקו תחתון (_) ובסימן שוויון (=). בלי אימוג׳י וסימנים אחרים.',
  reserved: 'השם וויקי בוט שמור לבוט הרשמי.',
  blocked: 'אי אפשר לבחור את הכינוי הזה. נסו כינוי אחר.',
};

let segmenter = null;
try {
  segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('he', { granularity: 'grapheme' }) : null;
} catch {
  segmenter = null;
}

// Counts what a person sees as characters: an emoji or a letter with niqqud is one.
export function nicknameLength(value) {
  const text = String(value || '');
  if (segmenter) {
    let count = 0;
    for (const _ of segmenter.segment(text)) count += 1;
    return count;
  }
  return Array.from(text).length;
}

export function cleanNickname(value) {
  // Spaces at the ends are dropped and a run of spaces counts as one.
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// Format problems only (no blocked-word check), so the field can flag them while typing.
export function nicknameFormatProblem(value) {
  const name = cleanNickname(value);
  if (!name) return NICKNAME_ERRORS.empty;
  if (!ALLOWED.test(name)) return NICKNAME_ERRORS.chars;
  const length = nicknameLength(name);
  if (length > NICKNAME_MAX) return NICKNAME_ERRORS.long;
  if (length < NICKNAME_MIN) return NICKNAME_ERRORS.short;
  return '';
}

// The exact name from the player's Google account (same trimming), so it can be kept as is.
export function isGoogleName(value, googleName) {
  const name = cleanNickname(value);
  return Boolean(name) && Boolean(googleName) && name === cleanNickname(googleName);
}

// googleName: pass it only when the player chose "keep my Google name" and the name is that exact name.
// Then the blocked-words check is skipped (a real name like "בן זיני"); Omri gets an email instead.
// The format rules still apply. Any typed nickname gets the full check.
export function nicknameProblem(value, { googleName = '' } = {}) {
  const name = cleanNickname(value);
  const format = nicknameFormatProblem(name);
  if (format) return format;
  if (isReservedPlayerName(name)) return NICKNAME_ERRORS.reserved;
  if (isBlockedNickname(name) && !isGoogleName(name, googleName)) return NICKNAME_ERRORS.blocked;
  return '';
}
