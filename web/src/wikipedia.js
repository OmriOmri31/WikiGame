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

function utcParts(date) {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
  };
}

function utcDateKey(date = new Date()) {
  const parts = utcParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
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

async function fetchPopularTitles(targetTitle) {
  const now = new Date();
  const yesterday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
  ));
  const parts = utcParts(yesterday);
  const endpoint = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/he.wikipedia/all-access/${parts.year}/${parts.month}/${parts.day}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('pageviews');
  const data = await response.json();
  const articles = data.items?.[0]?.articles ?? [];
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
  return pool;
}

async function fetchRandomTitle(targetTitle) {
  const endpoint = new URL(API);
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('list', 'random');
  endpoint.searchParams.set('rnnamespace', '0');
  endpoint.searchParams.set('rnlimit', '8');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');

  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('network');
  const data = await response.json();
  const picked = (data.query?.random ?? [])
    .map((item) => normalizeTitle(item.title))
    .find((title) => !isBlockedStart(title, targetTitle));
  if (!picked) throw new Error('missing');
  return picked;
}

export async function resolveStartTitle(storedStart, targetTitle) {
  const start = normalizeTitle(storedStart);
  const target = normalizeTitle(targetTitle);
  if (!isMainPageTitle(start)) return start;

  try {
    const pool = await fetchPopularTitles(target);
    const picked = pickFromPool(pool, utcDateKey());
    if (picked) return picked;
  } catch (error) {
    console.error(error);
  }
  return fetchRandomTitle(target);
}
