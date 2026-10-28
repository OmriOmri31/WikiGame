import { normalizeTitle } from './wikipedia.js';

// The easy free game draws both articles from a fixed pool of well-known articles
// (web/public/easy-pool.json, built by scripts/build-easy-pool.mjs). It is fetched on first use.
export const EASY_POOL_URL = '/easy-pool.json';

let poolRequest = null;

export function easyTitles(data) {
  const kinds = data && typeof data.kinds === 'object' && data.kinds ? data.kinds : {};
  const seen = new Set();
  const titles = [];
  Object.values(kinds).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((item) => {
      const title = typeof item === 'string' ? normalizeTitle(item) : '';
      if (!title || title.includes(':') || seen.has(title)) return;
      seen.add(title);
      titles.push(title);
    });
  });
  return titles;
}

export function loadEasyPool(fetchImpl = (...args) => fetch(...args)) {
  if (!poolRequest) {
    poolRequest = Promise.resolve()
      .then(() => fetchImpl(EASY_POOL_URL))
      .then((response) => {
        if (!response.ok) throw new Error('easy-pool');
        return response.json();
      })
      .then((data) => {
        const titles = easyTitles(data);
        if (titles.length < 2) throw new Error('easy-pool');
        return titles;
      });
    poolRequest.catch(() => { poolRequest = null; });
  }
  return poolRequest;
}

let lastKey = '';

// Two different titles from the pool, not the same pair as the last draw.
export function drawEasyPair(titles, random = Math.random) {
  if (!Array.isArray(titles) || titles.length < 2) throw new Error('easy-pool');
  let start = titles[0];
  let goal = titles[1];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const startIndex = Math.floor(random() * titles.length);
    let goalIndex = Math.floor(random() * (titles.length - 1));
    if (goalIndex >= startIndex) goalIndex += 1;
    start = titles[startIndex];
    goal = titles[goalIndex];
    if (`${start}\n${goal}` !== lastKey || titles.length < 3) break;
  }
  lastKey = `${start}\n${goal}`;
  return { start, goal };
}

export async function pickEasyPair() {
  return drawEasyPair(await loadEasyPool());
}

export function resetEasyPoolForTests() {
  poolRequest = null;
  lastKey = '';
}
