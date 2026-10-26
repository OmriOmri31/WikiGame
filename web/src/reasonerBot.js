import { normalizeTitle } from './wikipedia.js';

export const REASONER_NAME = 'וויקי בוט';
export const REASONER_UID = 'wiki-reasoner';
export const REASONER_MAX_PAGES = 25;

export function isReasoner(row) {
  return row?.uid === REASONER_UID;
}

function fnv(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function reasonerScoreId(stamp, start, goal) {
  const raw = `${stamp}|${normalizeTitle(start)}|${normalizeTitle(goal)}`;
  return `wiki-reasoner-${fnv(raw, 2166136261)}-${fnv(raw, 2166136261 ^ 0x811c9dc5)}`;
}
