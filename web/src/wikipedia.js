import DOMPurify from 'dompurify';

const API = 'https://he.wikipedia.org/w/api.php';

export function normalizeTitle(title) {
  let value = String(title ?? '').trim();
  try {
    value = decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    // Keep the raw title when it is not valid percent-encoding.
  }
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sameTitle(a, b) {
  return normalizeTitle(a) === normalizeTitle(b);
}

export function articleUrl(title) {
  const slug = encodeURIComponent(normalizeTitle(title).replace(/ /g, '_'));
  return `https://he.wikipedia.org/wiki/${slug}`;
}

/**
 * Classify a Wikipedia href.
 * Hash links stay on the page. Only Hebrew Wikipedia articles are playable.
 * Special pages (search, random) are blocked so the path stays inside articles.
 */
export function titleFromHref(href) {
  if (!href) return { kind: 'external' };
  if (href.startsWith('#')) return { kind: 'hash' };

  let url;
  try {
    url = new URL(href, 'https://he.wikipedia.org');
  } catch {
    return { kind: 'external' };
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'he.wikipedia.org' && host !== 'he.m.wikipedia.org') {
    return { kind: 'external' };
  }

  let title = '';
  if (url.pathname.startsWith('/wiki/')) {
    title = normalizeTitle(url.pathname.slice('/wiki/'.length));
  } else if (url.pathname === '/w/index.php') {
    const action = (url.searchParams.get('action') || 'view').toLowerCase();
    if (action !== 'view') return { kind: 'blocked' };
    title = normalizeTitle(url.searchParams.get('title') || '');
  } else {
    return { kind: 'external' };
  }

  if (!title) return { kind: 'blocked' };

  const prefix = title.split(':')[0].trim().toLowerCase();
  if (prefix === 'special' || prefix === 'מיוחד') return { kind: 'blocked' };

  return { kind: 'article', title, hash: url.hash || '' };
}

export async function fetchArticle(title) {
  const endpoint = new URL(API);
  endpoint.searchParams.set('action', 'parse');
  endpoint.searchParams.set('page', normalizeTitle(title));
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  endpoint.searchParams.set('prop', 'text|displaytitle');
  endpoint.searchParams.set('redirects', '1');
  endpoint.searchParams.set('disableeditsection', '1');

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('network');
  }

  const data = await response.json();
  if (data.error || !data.parse?.text?.['*']) {
    const error = new Error(data.error?.info || 'missing');
    error.code = data.error?.code || 'missing';
    throw error;
  }

  return {
    title: data.parse.title,
    html: data.parse.text['*'],
  };
}

function absolutize(value) {
  if (!value) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://he.wikipedia.org${value}`;
  return value;
}

export function prepareArticleHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  root.querySelectorAll('script, link, iframe, object, form, input, button').forEach((node) => {
    node.remove();
  });
  root.querySelectorAll('.mw-editsection, .mw-empty-elt').forEach((node) => {
    node.remove();
  });

  root.querySelectorAll('[src]').forEach((element) => {
    element.setAttribute('src', absolutize(element.getAttribute('src')));
  });

  root.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src') || '';
    const dataSrc = image.getAttribute('data-src');
    if (dataSrc && (!src || src.startsWith('data:'))) {
      image.setAttribute('src', absolutize(dataSrc));
    }
    image.setAttribute('loading', 'lazy');
  });

  root.querySelectorAll('[srcset]').forEach((element) => {
    const rewritten = element.getAttribute('srcset').split(',').map((part) => {
      const bits = part.trim().split(/\s+/);
      bits[0] = absolutize(bits[0]);
      return bits.join(' ');
    }).join(', ');
    element.setAttribute('srcset', rewritten);
  });

  return DOMPurify.sanitize(root.innerHTML, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['srcset', 'decoding', 'loading'],
  });
}

const MAIN_PAGE_TITLES = new Set(['עמוד ראשי', 'main page']);

function isMainPageTitle(title) {
  return MAIN_PAGE_TITLES.has(normalizeTitle(title).toLowerCase());
}

function isBlockedStart(title, targetTitle) {
  const normalized = normalizeTitle(title);
  if (!normalized) return true;
  if (isMainPageTitle(normalized)) return true;
  if (targetTitle && sameTitle(normalized, targetTitle)) return true;
  return normalized.includes(':');
}

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
// A UTC day's pageviews are often unpublished for many hours, and the file can
// still be revised after it first appears. Lagging three Israel calendar days
// means the list is already final at 00:00, so the pick does not move again
// later that day. The Israel date itself is what changes the article.
const PAGEVIEW_LAG_DAYS = 3;

const israelDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function israelDateParts(date) {
  const parts = israelDateFormatter.formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function israelDateKey(date = new Date()) {
  const { year, month, day } = israelDateParts(date);
  const pad = (part) => String(part).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function israelHour(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(formatted.find((part) => part.type === 'hour')?.value);
  if (!Number.isFinite(hour)) return 0;
  return hour % 24;
}

export function addIsraelDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (part) => String(part).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

// The pair that goes live at the next midnight in Israel.
// During the midnight hour the new day is the one being published.
export function nextPublishDateKey(date = new Date()) {
  const today = israelDateKey(date);
  return israelHour(date) === 0 ? today : addIsraelDays(today, 1);
}

function pageviewDateParts(date = new Date(), extraLag = 0) {
  const { year, month, day } = israelDateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day - PAGEVIEW_LAG_DAYS - extraLag));
  const pad = (part) => String(part).padStart(2, '0');
  return {
    year: String(shifted.getUTCFullYear()),
    month: pad(shifted.getUTCMonth() + 1),
    day: pad(shifted.getUTCDate()),
  };
}

async function fetchTopArticles(date, extraLag = 0) {
  const parts = pageviewDateParts(date, extraLag);
  const endpoint = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/he.wikipedia/all-access/${parts.year}/${parts.month}/${parts.day}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('pageviews');
  const data = await response.json();
  return data.items?.[0]?.articles ?? [];
}

function pickFromPool(titles, dateKey) {
  if (!titles.length) return '';
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return titles[(hash >>> 0) % titles.length];
}

async function fetchPopularTitles(targetTitle, date = new Date()) {
  const articles = await fetchTopArticles(date, 0);
  const seen = new Set();
  const pool = [];
  articles
    .slice()
    .sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0))
    .forEach((item) => {
      const title = normalizeTitle(item.article);
      if (seen.has(title) || isBlockedStart(title, targetTitle)) return;
      seen.add(title);
      pool.push(title);
    });
  pool.sort((a, b) => (a > b) - (a < b));
  return pool;
}

// Daily play uses one day's most-read pages. Free play keeps that filter, then
// opens it across the previous days and draws a new pair every game.
const FREE_PLAY_EXTRA_DAYS = 6;

function isFreePlayCandidate(title) {
  if (isBlockedStart(title, '')) return false;
  return !normalizeTitle(title).includes('(פירושונים)');
}

let freePlayPoolCache = { key: '', titles: null, pending: null };

async function freePlayPool(date = new Date()) {
  const key = israelDateKey(date);
  if (freePlayPoolCache.key === key && freePlayPoolCache.titles) return freePlayPoolCache.titles;
  if (freePlayPoolCache.key === key && freePlayPoolCache.pending) return freePlayPoolCache.pending;

  const pending = (async () => {
    const lags = Array.from({ length: FREE_PLAY_EXTRA_DAYS + 1 }, (_, index) => index);
    const results = await Promise.allSettled(lags.map((extra) => fetchTopArticles(date, extra)));
    const seen = new Set();
    const pool = [];
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((item) => {
        const title = normalizeTitle(item.article);
        if (seen.has(title) || !isFreePlayCandidate(title)) return;
        seen.add(title);
        pool.push(title);
      });
    });
    if (pool.length < 2) throw new Error('pageviews');
    return pool;
  })().then((titles) => {
    freePlayPoolCache = { key, titles, pending: null };
    return titles;
  }).catch((error) => {
    if (freePlayPoolCache.key === key) freePlayPoolCache = { key: '', titles: null, pending: null };
    throw error;
  });

  freePlayPoolCache = { key, titles: null, pending };
  return pending;
}

let lastFreePlayKey = '';

export async function pickFreePlayPair(date = new Date()) {
  const pool = await freePlayPool(date);
  let startIndex = 0;
  let goalIndex = 1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    startIndex = Math.floor(Math.random() * pool.length);
    goalIndex = Math.floor(Math.random() * (pool.length - 1));
    if (goalIndex >= startIndex) goalIndex += 1;
    const key = `${pool[startIndex]}\n${pool[goalIndex]}`;
    if (key !== lastFreePlayKey || pool.length < 3) {
      lastFreePlayKey = key;
      break;
    }
  }
  return { start: pool[startIndex], goal: pool[goalIndex] };
}

// `taken` is a set of "start\ngoal" keys. The drawn pair is added to it.
export async function drawDistinctPair(taken, date = new Date()) {
  const pool = await freePlayPool(date);
  const used = taken instanceof Set ? taken : new Set();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const startIndex = Math.floor(Math.random() * pool.length);
    let goalIndex = Math.floor(Math.random() * (pool.length - 1));
    if (goalIndex >= startIndex) goalIndex += 1;
    const start = pool[startIndex];
    const goal = pool[goalIndex];
    if (!start || !goal || sameTitle(start, goal)) continue;
    const key = `${start}\n${goal}`;
    if (used.has(key)) continue;
    used.add(key);
    return { start, goal };
  }
  throw new Error('pair');
}

export async function resolveStartTitle(storedStart, targetTitle, date = new Date()) {
  const start = normalizeTitle(storedStart);
  const target = normalizeTitle(targetTitle);
  if (!isMainPageTitle(start)) return start;

  const pool = await fetchPopularTitles(target, date);
  const picked = pickFromPool(pool, israelDateKey(date));
  if (!picked) throw new Error('pageviews');
  return picked;
}
