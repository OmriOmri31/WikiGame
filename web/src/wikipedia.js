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

  root.querySelectorAll('script, style, link, iframe, object, form, input, button').forEach((node) => {
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
    ADD_ATTR: ['srcset', 'decoding', 'loading'],
  });
}
