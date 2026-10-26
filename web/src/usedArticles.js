import { normalizeTitle } from './wikipedia.js';

// Same collection as the queue, so the desk rules that are already published can read and write it.
export const USED_COLLECTION = 'lotteryQueue';
export const USED_DOCUMENT = 'used';

// The pool starts with these two. Later titles join only after a pair is published.
export const SEED_USED_TITLES = ['רואנדה', 'ירושלים'];

export function normalizeUsedTitles(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const titles = [];
  raw.forEach((item) => {
    const title = normalizeTitle(item);
    if (!title || seen.has(title)) return;
    seen.add(title);
    titles.push(title);
  });
  return titles;
}

export function mergeUsedTitles(existing, added) {
  const extra = Array.isArray(added) ? added : [added];
  return normalizeUsedTitles([
    ...SEED_USED_TITLES,
    ...(Array.isArray(existing) ? existing : []),
    ...extra,
  ]);
}

export function withSeedTitles(titles) {
  return mergeUsedTitles(titles, []);
}

export function usedTitleSet(titles) {
  return new Set(withSeedTitles(titles));
}

export function sameTitleList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((title, index) => title === right[index]);
}

export function pairBlocked(start, goal, blocked) {
  if (!blocked || typeof blocked.has !== 'function') return false;
  return blocked.has(normalizeTitle(start)) || blocked.has(normalizeTitle(goal));
}
