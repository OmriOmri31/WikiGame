import { fetchArticle, normalizeTitle, prepareArticleHtml } from './wikipedia.js';

// Article requests shared by the home screen and the game, so the daily game's two articles are
// requested once: the home screen starts them in the background, and the game reuses the same
// request (finished or still running) when the player taps "משחק יומי". Nothing here is shown on
// screen. A failed request is dropped, so the game simply asks again.
const KEEP_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 6;

const entries = new Map();
const prepared = new WeakMap();

function fresh(entry, now) {
  return entry && now - entry.at < KEEP_MS;
}

// The request for `title`: the one already made, or a new one.
export function sharedArticle(title, { fetchImpl = fetchArticle, now = Date.now() } = {}) {
  const key = normalizeTitle(title);
  if (!key) return Promise.reject(new Error('missing'));
  const existing = entries.get(key);
  if (fresh(existing, now)) return existing.promise;
  const promise = Promise.resolve().then(() => fetchImpl(key));
  entries.set(key, { at: now, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  return promise;
}

// The request already made for `title`, or null. Never starts a request.
export function peekArticle(title, now = Date.now()) {
  const entry = entries.get(normalizeTitle(title));
  return fresh(entry, now) ? entry.promise : null;
}

// The cleaned-up HTML of a loaded article, worked out once per article.
export function preparedHtml(article, prepare = prepareArticleHtml) {
  if (!article || typeof article !== 'object') return prepare(article?.html ?? '');
  if (!prepared.has(article)) prepared.set(article, prepare(article.html));
  return prepared.get(article);
}

export function clearArticleCache() {
  entries.clear();
}
