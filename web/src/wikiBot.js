import { normalizeTitle, sameTitle } from './wikipedia';

export const WIKI_BOT_NAME = 'הדרך המהירה ביותר';
export const WIKI_BOT_UID = 'wiki-bot';
export const WIKI_BOT_MAX_PAGES = 25;

const API = 'https://he.wikipedia.org/w/api.php';
const REQUEST_LIMIT = 6;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function wikiGet(params, attempt = 0) {
  const url = new URL(API);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  url.searchParams.set('maxlag', '5');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: { 'Api-User-Agent': 'WikiWikiBot/1.0 (he.wikipedia daily challenge)' },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * (2 ** attempt));
    return wikiGet(params, attempt + 1);
  }
  if (!response.ok) throw new Error('wiki');

  const data = await response.json();
  if (data?.error?.code === 'maxlag' && attempt < 5) {
    await sleep((Number(data.error.lag) || 1) * 1000);
    return wikiGet(params, attempt + 1);
  }
  if (data?.error) {
    const error = new Error(data.error.info || 'wiki');
    error.code = data.error.code || 'wiki';
    throw error;
  }
  return data;
}

async function pageItems(title, prop, listKey, more) {
  const items = [];
  let extra = null;
  do {
    const data = await wikiGet({
      action: 'query',
      titles: title,
      prop,
      ...more,
      ...(extra || {}),
    });
    const page = data.query?.pages?.[0];
    if (page?.[listKey]) items.push(...page[listKey]);
    extra = data.continue || null;
  } while (extra);
  return items;
}

function followRedirects(title, normalized, redirects) {
  let name = normalized.get(title) || title;
  const seen = new Set();
  while (redirects.has(name) && !seen.has(name)) {
    seen.add(name);
    name = redirects.get(name);
  }
  return name;
}

async function resolveTitles(titles, cache) {
  const pending = [];
  titles.forEach((title) => {
    const key = normalizeTitle(title);
    if (!key || key.includes('|') || cache.has(key)) return;
    pending.push(key);
  });

  for (let index = 0; index < pending.length; index += 50) {
    const chunk = pending.slice(index, index + 50);
    const data = await wikiGet({
      action: 'query',
      titles: chunk.join('|'),
      redirects: '1',
    });
    const normalized = new Map();
    (data.query?.normalized || []).forEach((row) => normalized.set(row.from, row.to));
    const redirects = new Map();
    (data.query?.redirects || []).forEach((row) => redirects.set(row.from, row.to));
    const missing = new Set(
      (data.query?.pages || []).filter((page) => page.missing).map((page) => page.title),
    );
    chunk.forEach((title) => {
      const resolved = followRedirects(title, normalized, redirects);
      cache.set(title, missing.has(resolved) ? '' : normalizeTitle(resolved));
    });
  }

  return titles.map((title) => cache.get(normalizeTitle(title)) || '');
}

function cachedList(cache, title, load) {
  const key = normalizeTitle(title);
  if (!cache.has(key)) {
    const pending = load(key).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return cache.get(key);
}

async function mapPool(items, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(REQUEST_LIMIT, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function remember(side, neighbor, pages, parentTitle, dist, parent) {
  if (dist.has(neighbor)) return false;
  dist.set(neighbor, pages);
  parent.set(neighbor, parentTitle);
  side.push(neighbor);
  return true;
}

function stitch(meet, parentTowardStart, parentTowardGoal) {
  const left = [];
  let cursor = meet;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    left.push(cursor);
    cursor = parentTowardStart.get(cursor);
  }
  left.reverse();
  const right = [];
  cursor = parentTowardGoal.get(meet);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    right.push(cursor);
    cursor = parentTowardGoal.get(cursor);
  }
  return [...left, ...right];
}

export async function canonicalTitle(title) {
  const [resolved] = await resolveTitles([title], new Map());
  if (!resolved) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  return resolved;
}

// Shortest clickable route. Forward follows article links; backward follows
// pages that link here, including links that only name a redirect.
export async function findShortestPath(startTitle, goalTitle, { maxPages = WIKI_BOT_MAX_PAGES } = {}) {
  const startedAt = performance.now();
  const resolveCache = new Map();
  const [start, goal] = await resolveTitles([startTitle, goalTitle], resolveCache);
  if (!start || !goal) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  if (sameTitle(start, goal)) {
    return {
      path: [start],
      pagesVisited: 1,
      timeTaken: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
    };
  }

  const outgoingCache = new Map();
  const incomingCache = new Map();

  function outgoing(title) {
    return cachedList(outgoingCache, title, async (key) => {
      const raw = await pageItems(key, 'links', 'links', { plnamespace: '0', pllimit: 'max' });
      const resolved = await resolveTitles(raw.map((link) => link.title), resolveCache);
      return [...new Set(resolved.filter((name) => name && !sameTitle(name, key)))];
    });
  }

  function incoming(title) {
    return cachedList(incomingCache, title, async (key) => {
      const redirects = await pageItems(key, 'redirects', 'redirects', {
        rdnamespace: '0',
        rdlimit: 'max',
      });
      const sources = [key, ...redirects.map((row) => row.title)];
      const lists = await mapPool(sources, (source) => pageItems(source, 'linkshere', 'linkshere', {
        lhnamespace: '0',
        lhlimit: 'max',
        lhshow: '!redirect',
      }));
      const names = new Set();
      lists.flat().forEach((row) => {
        const name = normalizeTitle(row.title);
        if (name && !sameTitle(name, key)) names.add(name);
      });
      return [...names];
    });
  }

  const distF = new Map([[start, 1]]);
  const distB = new Map([[goal, 1]]);
  const parentF = new Map();
  const parentB = new Map();
  let queueF = [start];
  let queueB = [goal];
  let depthF = 1;
  let depthB = 1;

  while (queueF.length || queueB.length) {
    if (depthF + depthB > maxPages) break;
    const expandForward = queueB.length === 0
      || (queueF.length > 0 && (depthF < depthB || (depthF === depthB && queueF.length <= queueB.length)));
    const queue = expandForward ? queueF : queueB;
    const lists = await mapPool(queue, (title) => (expandForward ? outgoing(title) : incoming(title)));
    const next = [];
    let best = null;

    lists.forEach((neighbors, index) => {
      const current = queue[index];
      const currentPages = (expandForward ? distF : distB).get(current);
      neighbors.forEach((neighbor) => {
        const nextPages = currentPages + 1;
        if (nextPages > maxPages) return;
        if (expandForward) {
          if (distB.has(neighbor)) {
            const total = nextPages + distB.get(neighbor) - 1;
            if (total <= maxPages && (!best || total < best.total)) {
              best = { total, meet: neighbor, via: current };
            }
            return;
          }
          remember(next, neighbor, nextPages, current, distF, parentF);
          return;
        }
        if (distF.has(neighbor)) {
          const total = nextPages + distF.get(neighbor) - 1;
          if (total <= maxPages && (!best || total < best.total)) {
            best = { total, meet: neighbor, via: current };
          }
          return;
        }
        remember(next, neighbor, nextPages, current, distB, parentB);
      });
    });

    if (best) {
      if (expandForward) parentF.set(best.meet, best.via);
      else parentB.set(best.meet, best.via);
      const path = stitch(best.meet, parentF, parentB);
      if (path.length <= maxPages && sameTitle(path[0], start) && sameTitle(path[path.length - 1], goal)) {
        return {
          path,
          pagesVisited: path.length,
          timeTaken: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
        };
      }
    }

    if (expandForward) {
      queueF = next;
      depthF += 1;
    } else {
      queueB = next;
      depthB += 1;
    }
  }

  return null;
}

export function isWikiBot(row) {
  return row?.uid === WIKI_BOT_UID || row?.bot === true;
}

function fnv(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function botScoreId(stamp, start, goal) {
  const raw = `${stamp}|${normalizeTitle(start)}|${normalizeTitle(goal)}`;
  return `wiki-bot-${fnv(raw, 2166136261)}-${fnv(raw, 2166136261 ^ 0x811c9dc5)}`;
}
