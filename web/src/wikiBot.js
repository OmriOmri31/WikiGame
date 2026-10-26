import { normalizeTitle, sameTitle, titleFromHref } from './wikipedia.js';

export const WIKI_BOT_NAME = 'הדרך המהירה ביותר';
export const WIKI_BOT_UID = 'wiki-bot';
export const WIKI_BOT_MAX_PAGES = 25;

const API = 'https://he.wikipedia.org/w/api.php';
const REQUEST_LIMIT = 3;

// Wikimedia throttles clients that don't identify themselves. Browsers can't set User-Agent, so
// they send Api-User-Agent; the server job (Node) sends a real User-Agent with a contact page.
const BOT_AGENT = 'WikiWikiBot/1.0 (https://wiki-wiki.netlify.app; https://github.com/OmriOmri31/WikiGame)';
const WIKI_HEADERS = typeof window === 'undefined'
  ? { 'User-Agent': BOT_AGENT, 'Api-User-Agent': BOT_AGENT }
  : { 'Api-User-Agent': BOT_AGENT };

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function stopped() {
  const error = new Error('stopped');
  error.code = 'stopped';
  return error;
}

// params.signal (an AbortSignal) stops a search that ran out of time, so it doesn't keep
// sending requests while the next attempt runs.
async function wikiGet(allParams, attempt = 0) {
  const { signal, ...params } = allParams;
  if (signal?.aborted) throw stopped();
  const url = new URL(API);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  url.searchParams.set('maxlag', '5');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetch(url, { headers: WIKI_HEADERS, signal });
  } catch (error) {
    if (signal?.aborted) throw stopped();
    throw error;
  }
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * (2 ** attempt), signal);
    return wikiGet(allParams, attempt + 1);
  }
  if (!response.ok) throw new Error('wiki');

  const data = await response.json();
  if (data?.error?.code === 'maxlag' && attempt < 5) {
    await sleep((Number(data.error.lag) || 1) * 1000, signal);
    return wikiGet(allParams, attempt + 1);
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

// One list (links, linkshere, redirects) for many pages at once: 50 titles per request, following
// continuation until every page's list is complete. Returns Map(input title -> rows).
async function batchItems(titles, prop, listKey, more, signal) {
  const out = new Map();
  const chunks = [];
  for (let index = 0; index < titles.length; index += 50) chunks.push(titles.slice(index, index + 50));
  await mapPool(chunks, async (chunk) => {
    const byPage = new Map();
    const normalized = new Map();
    let extra = null;
    do {
      const data = await wikiGet({
        action: 'query',
        titles: chunk.join('|'),
        prop,
        ...more,
        ...(extra || {}),
        signal,
      });
      (data.query?.normalized || []).forEach((row) => normalized.set(row.from, row.to));
      (data.query?.pages || []).forEach((page) => {
        if (!page?.title) return;
        const rows = byPage.get(page.title) || [];
        if (Array.isArray(page[listKey])) rows.push(...page[listKey]);
        byPage.set(page.title, rows);
      });
      extra = data.continue || null;
    } while (extra);
    chunk.forEach((title) => out.set(title, byPage.get(normalized.get(title) || title) || []));
  });
  return out;
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

async function resolveTitles(titles, cache, signal) {
  const pending = [];
  const queued = new Set();
  titles.forEach((title) => {
    const key = normalizeTitle(title);
    if (!key || key.includes('|') || cache.has(key) || queued.has(key)) return;
    queued.add(key);
    pending.push(key);
  });

  const chunks = [];
  for (let index = 0; index < pending.length; index += 50) chunks.push(pending.slice(index, index + 50));
  await mapPool(chunks, async (chunk) => {
    const data = await wikiGet({
      action: 'query',
      titles: chunk.join('|'),
      redirects: '1',
      signal,
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
  });

  return titles.map((title) => cache.get(normalizeTitle(title)) || '');
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

function remember(side, neighbor, pages, edge, dist, parent) {
  if (dist.has(neighbor)) return false;
  dist.set(neighbor, pages);
  parent.set(neighbor, edge);
  side.push(neighbor);
  return true;
}

function edgeTitle(edge) {
  return typeof edge === 'string' ? edge : (edge?.title || '');
}

function edgeVia(edge) {
  return typeof edge === 'string' ? '' : (edge?.via || '');
}

function stitch(meet, parentTowardStart, parentTowardGoal) {
  const left = [];
  const leftVia = [];
  let cursor = meet;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    left.push(cursor);
    const edge = parentTowardStart.get(cursor);
    const previous = edgeTitle(edge);
    if (!previous || seen.has(previous)) break;
    leftVia.push(edgeVia(edge));
    cursor = previous;
  }
  left.reverse();
  leftVia.reverse();

  const right = [];
  const rightVia = [];
  const meetEdge = parentTowardGoal.get(meet);
  cursor = edgeTitle(meetEdge);
  if (cursor && !seen.has(cursor)) rightVia.push(edgeVia(meetEdge));
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    right.push(cursor);
    const edge = parentTowardGoal.get(cursor);
    const next = edgeTitle(edge);
    if (!next || seen.has(next)) break;
    rightVia.push(edgeVia(edge));
    cursor = next;
  }

  return {
    path: [...left, ...right],
    via: [...leftVia, ...rightVia],
  };
}

function articleSuggestions(data) {
  const pages = data?.query?.pages || [];
  return pages
    .filter((page) => page && !page.missing && page.ns === 0 && !page.pageprops?.disambiguation && page.title)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => ({
      title: normalizeTitle(page.title),
      description: typeof page.description === 'string' ? page.description : '',
    }))
    .filter((page) => page.title);
}

export async function suggestArticles(query) {
  const search = normalizeTitle(query);
  if (!search || search.includes('|')) return [];
  const prefix = wikiGet({
    action: 'query',
    generator: 'prefixsearch',
    gpssearch: search,
    gpsnamespace: '0',
    gpslimit: '8',
    prop: 'description|pageprops',
    ppprop: 'disambiguation',
    redirects: '1',
  });
  const broader = search.length < 2
    ? Promise.resolve(null)
    : wikiGet({
      action: 'query',
      generator: 'search',
      gsrsearch: search,
      gsrnamespace: '0',
      gsrlimit: '8',
      prop: 'description|pageprops',
      ppprop: 'disambiguation',
      redirects: '1',
    });
  const [prefixResult, searchResult] = await Promise.allSettled([prefix, broader]);
  if (prefixResult.status === 'rejected' && searchResult.status === 'rejected') {
    throw prefixResult.reason;
  }
  const merged = [];
  const seen = new Set();
  [
    ...articleSuggestions(prefixResult.status === 'fulfilled' ? prefixResult.value : null),
    ...articleSuggestions(searchResult.status === 'fulfilled' ? searchResult.value : null),
  ].forEach((item) => {
    if (seen.has(item.title)) return;
    seen.add(item.title);
    merged.push(item);
  });
  return merged.slice(0, 8);
}

export async function confirmedArticle(title) {
  const search = normalizeTitle(title);
  if (!search || search.includes('|')) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  const data = await wikiGet({
    action: 'query',
    titles: search,
    redirects: '1',
    prop: 'pageprops',
    ppprop: 'disambiguation',
  });
  const normalized = new Map();
  (data.query?.normalized || []).forEach((row) => normalized.set(row.from, row.to));
  const redirects = new Map();
  (data.query?.redirects || []).forEach((row) => redirects.set(row.from, row.to));
  const resolved = followRedirects(search, normalized, redirects);
  const page = (data.query?.pages || []).find((item) => sameTitle(item.title, resolved));
  if (!page || page.missing || page.ns !== 0) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  if (page.pageprops?.disambiguation) {
    const error = new Error('disambiguation');
    error.code = 'disambiguation';
    throw error;
  }
  return normalizeTitle(page.title);
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

const HIDDEN_CLASS = /(?:^|\s)(?:mobileonly|mw-editsection|mw-empty-elt)(?:\s|$)/i;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function attr(source, name) {
  const found = source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!found) return '';
  return decodeHtml(found[1] ?? found[2] ?? '');
}

function elementHidden(attrs) {
  if (/(?:^|\s)hidden(?:\s|=|$)/i.test(attrs)) return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(attrs, 'style'))) return true;
  return HIDDEN_CLASS.test(attr(attrs, 'class'));
}

function cleanLabel(value) {
  return normalizeTitle(String(value || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ''));
}

function tagName(raw) {
  const trimmed = raw.trim().replace(/\/\s*$/, '');
  const split = trimmed.search(/\s/);
  return (split === -1 ? trimmed : trimmed.slice(0, split)).toLowerCase();
}

// Links a player can actually click, with the text printed on the page.
function extractAnchors(html) {
  const anchors = [];
  const source = String(html || '');
  const stack = [];
  let current = null;
  let anchorDepth = 0;
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const text = source.slice(index, next === -1 ? source.length : next);
      if (current && !stack.at(-1)?.hidden) current.label += ` ${decodeHtml(text)}`;
      index = next === -1 ? source.length : next;
      continue;
    }

    const end = source.indexOf('>', index + 1);
    if (end === -1) break;
    const raw = source.slice(index + 1, end);
    const closing = raw[0] === '/';
    const name = tagName(closing ? raw.slice(1) : raw);
    index = end + 1;
    if (!name) continue;

    if (closing) {
      if (name === 'a') {
        anchorDepth = Math.max(0, anchorDepth - 1);
        if (anchorDepth === 0 && current) {
          anchors.push({ title: current.title, label: cleanLabel(current.label) });
          current = null;
        }
      }
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const attrs = raw.slice(name.length);
    const hidden = elementHidden(attrs) || Boolean(stack.at(-1)?.hidden);
    if (!(VOID_TAGS.has(name) || /\/\s*$/.test(raw))) stack.push({ name, hidden });
    if (name === 'a') {
      if (anchorDepth === 0) {
        const parsed = titleFromHref(attr(attrs, 'href'));
        const red = /(?:^|\s)new(?:\s|$)/i.test(attr(attrs, 'class'));
        if (!hidden && !red && parsed.kind === 'article') {
          current = { title: parsed.title, label: '' };
        }
      }
      anchorDepth += 1;
    } else if (current && name === 'img' && !hidden) {
      const alt = cleanLabel(attr(attrs, 'alt'));
      if (alt) current.label += ` ${alt}`;
    }
  }

  return anchors;
}

function edgeKey(from, to) {
  return `${normalizeTitle(from)}\n${normalizeTitle(to)}`;
}

function visibleVia(hits, target) {
  if (hits.some((hit) => hit.label && sameTitle(hit.label, target))) return '';
  const labeled = hits.find((hit) => hit.label && !sameTitle(hit.label, target));
  if (labeled) return labeled.label;
  const redirect = hits.find((hit) => hit.hrefTitle && !sameTitle(hit.hrefTitle, target));
  return redirect ? normalizeTitle(redirect.hrefTitle) : '';
}

function linkStore(cache) {
  if (cache?.anchors && cache?.redirects) return cache;
  return { anchors: new Map(), redirects: new Map() };
}

async function pageAnchors(title, cache) {
  const key = normalizeTitle(title);
  if (!cache.has(key)) {
    const pending = wikiGet({
      action: 'parse',
      page: key,
      prop: 'text',
      redirects: '1',
      disableeditsection: '1',
    }).then((data) => {
      const html = typeof data.parse?.text === 'string' ? data.parse.text : '';
      return extractAnchors(html);
    }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return cache.get(key);
}

async function redirectNames(title, cache) {
  const key = normalizeTitle(title);
  if (!cache.has(key)) {
    const pending = pageItems(key, 'redirects', 'redirects', {
      rdnamespace: '0',
      rdlimit: 'max',
    }).then((rows) => {
      const names = new Set([key]);
      rows.forEach((row) => {
        const name = normalizeTitle(row.title);
        if (name) names.add(name);
      });
      return names;
    }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return cache.get(key);
}

// `via` is the text a player has to find when the article title itself is not
// written on the link. A hop with no clickable anchor is rejected.
export async function clickableVias(titles, cache = null) {
  const store = linkStore(cache);
  const path = (Array.isArray(titles) ? titles : []).map((title) => normalizeTitle(title));
  if (path.length < 2) return { ok: true, via: [], missing: [] };
  const via = [];
  const missing = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    if (!from || !to) {
      missing.push(edgeKey(from, to));
      via.push('');
      continue;
    }
    const [anchors, names] = await Promise.all([
      pageAnchors(from, store.anchors),
      redirectNames(to, store.redirects),
    ]);
    const hits = anchors
      .filter((anchor) => names.has(anchor.title))
      .map((anchor) => ({ hrefTitle: anchor.title, label: anchor.label }));
    if (hits.length === 0) {
      missing.push(edgeKey(from, to));
      via.push('');
      continue;
    }
    via.push(visibleVia(hits, to));
  }
  return { ok: missing.length === 0, via, missing };
}

// Shortest clickable route. Forward follows article links; backward follows
// pages that link here, including links that only name a redirect.
// The route is then checked against the rendered article. `via` is the visible
// link text when that text is not the next article's title.
async function searchRoute(start, goal, maxPages, blocked, resolveCache, outgoingCache, incomingCache, signal) {
  const startedAt = performance.now();
  if (!start || !goal) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  if (sameTitle(start, goal)) {
    return {
      path: [start],
      via: [],
      pagesVisited: 1,
      timeTaken: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
    };
  }

  // Neighbours of a whole search level, fetched in batches. Lists are cached for the retry loop.
  async function outgoingMany(titles) {
    const todo = titles.filter((title) => !outgoingCache.has(title));
    if (todo.length) {
      const rawLists = await batchItems(todo, 'links', 'links', { plnamespace: '0', pllimit: 'max' }, signal);
      const allLinks = [];
      rawLists.forEach((rows) => rows.forEach((row) => allLinks.push(row.title)));
      await resolveTitles(allLinks, resolveCache, signal);
      todo.forEach((key) => {
        const raw = rawLists.get(key) || [];
        const viaOf = new Map();
        const names = [];
        raw.forEach((link) => {
          const linkTitle = normalizeTitle(link.title);
          const name = resolveCache.get(linkTitle) || '';
          if (!name || sameTitle(name, key)) return;
          const direct = !linkTitle || sameTitle(linkTitle, name);
          if (!viaOf.has(name)) {
            viaOf.set(name, direct ? '' : linkTitle);
            names.push(name);
            return;
          }
          if (direct) viaOf.set(name, '');
          else if (viaOf.get(name) && linkTitle && linkTitle.length < viaOf.get(name).length) {
            viaOf.set(name, linkTitle);
          }
        });
        outgoingCache.set(key, names.map((name) => ({ title: name, via: viaOf.get(name) || '' })));
      });
    }
    return titles.map((title) => outgoingCache.get(title) || []);
  }

  async function incomingMany(titles) {
    const todo = titles.filter((title) => !incomingCache.has(title));
    if (todo.length) {
      const redirectLists = await batchItems(todo, 'redirects', 'redirects', { rdnamespace: '0', rdlimit: 'max' }, signal);
      const sourcesOf = new Map();
      const allSources = [];
      todo.forEach((key) => {
        const sources = [key, ...(redirectLists.get(key) || []).map((row) => normalizeTitle(row.title)).filter(Boolean)];
        sourcesOf.set(key, sources);
        allSources.push(...sources);
      });
      const hereLists = await batchItems([...new Set(allSources)], 'linkshere', 'linkshere', {
        lhnamespace: '0',
        lhlimit: 'max',
        lhshow: '!redirect',
      }, signal);
      todo.forEach((key) => {
        const viaOf = new Map();
        sourcesOf.get(key).forEach((source, index) => {
          const via = index === 0 ? '' : source;
          (hereLists.get(source) || []).forEach((row) => {
            const name = normalizeTitle(row.title);
            if (!name || sameTitle(name, key)) return;
            const current = viaOf.get(name);
            if (current === undefined || !via) viaOf.set(name, via);
            else if (current && via.length < current.length) viaOf.set(name, via);
          });
        });
        incomingCache.set(key, [...viaOf.entries()].map(([name, via]) => ({ title: name, via })));
      });
    }
    return titles.map((title) => incomingCache.get(title) || []);
  }

  const distF = new Map([[start, 1]]);
  const distB = new Map([[goal, 1]]);
  const parentF = new Map();
  const parentB = new Map();
  let queueF = [start];
  let queueB = [goal];
  let depthF = 1;
  let depthB = 1;

  // When either side runs out of pages, every page it can reach has been seen and none met the
  // other side, so there is no route.
  while (queueF.length && queueB.length) {
    if (depthF + depthB > maxPages) break;
    const expandForward = depthF < depthB || (depthF === depthB && queueF.length <= queueB.length);
    const queue = expandForward ? queueF : queueB;
    const lists = await (expandForward ? outgoingMany(queue) : incomingMany(queue));
    const next = [];
    let best = null;

    lists.forEach((neighbors, index) => {
      const current = queue[index];
      const currentPages = (expandForward ? distF : distB).get(current);
      neighbors.forEach((neighbor) => {
        const name = neighbor.title;
        const edge = { title: current, via: neighbor.via || '' };
        const nextPages = currentPages + 1;
        if (!name || nextPages > maxPages) return;
        const from = expandForward ? current : name;
        const to = expandForward ? name : current;
        if (blocked.has(edgeKey(from, to))) return;
        if (expandForward) {
          if (distB.has(name)) {
            const total = nextPages + distB.get(name) - 1;
            if (total <= maxPages && (!best || total < best.total)) {
              best = { total, meet: name, edge };
            }
            return;
          }
          remember(next, name, nextPages, edge, distF, parentF);
          return;
        }
        if (distF.has(name)) {
          const total = nextPages + distF.get(name) - 1;
          if (total <= maxPages && (!best || total < best.total)) {
            best = { total, meet: name, edge };
          }
          return;
        }
        remember(next, name, nextPages, edge, distB, parentB);
      });
    });

    if (best) {
      if (expandForward) parentF.set(best.meet, best.edge);
      else parentB.set(best.meet, best.edge);
      const route = stitch(best.meet, parentF, parentB);
      const { path, via } = route;
      if (path.length <= maxPages && sameTitle(path[0], start) && sameTitle(path[path.length - 1], goal)) {
        return {
          path,
          via,
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

// Returns the route, or null only when the search ran out of pages to try (no route within
// maxPages). Anything else (network, rate limits, a route that can't be confirmed, a stop) throws.
export async function findShortestPath(startTitle, goalTitle, { maxPages = WIKI_BOT_MAX_PAGES, signal } = {}) {
  const startedAt = performance.now();
  const resolveCache = new Map();
  const outgoingCache = new Map();
  const incomingCache = new Map();
  const renderedCache = { anchors: new Map(), redirects: new Map() };
  const blocked = new Set();
  const [start, goal] = await resolveTitles([startTitle, goalTitle], resolveCache, signal);
  if (!start || !goal) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  if (sameTitle(start, goal)) {
    return {
      path: [start],
      via: [],
      pagesVisited: 1,
      timeTaken: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const found = await searchRoute(
      start,
      goal,
      maxPages,
      blocked,
      resolveCache,
      outgoingCache,
      incomingCache,
      signal,
    );
    if (!found) return null;
    if (signal?.aborted) throw stopped();
    const notes = await clickableVias(found.path, renderedCache);
    if (notes.ok && notes.via.length === found.path.length - 1) {
      return {
        path: found.path,
        via: notes.via,
        pagesVisited: found.path.length,
        timeTaken: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      };
    }
    const before = blocked.size;
    notes.missing.forEach((key) => blocked.add(key));
    if (blocked.size === before) break;
  }
  const error = new Error('unconfirmed');
  error.code = 'unconfirmed';
  throw error;
}

// Visible link text between stored articles. Empty means the article title
// itself is what the player clicks.
export async function pathLinkNames(titles) {
  const path = (Array.isArray(titles) ? titles : []).map((title) => normalizeTitle(title)).filter(Boolean);
  if (path.length < 2) return [];
  try {
    const notes = await clickableVias(path);
    return notes.via;
  } catch (error) {
    console.error(error);
    return path.slice(0, -1).map(() => '');
  }
}

export function isWikiBot(row) {
  return row?.uid === WIKI_BOT_UID;
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
