import { normalizeTitle, sameTitle } from './wikipedia.js';
import { REASONER_MAX_PAGES } from './reasonerBot.js';

const MAX_USD = 0.08 / 3.12;
const MAX_CALLS = 32;
const MAX_LINKS = 40;
const WIKI = 'https://he.wikipedia.org/w/api.php';

const STOP_WORDS = new Set(['של', 'על', 'עם', 'אל', 'את', 'הוא', 'היא', 'זה', 'זו', 'בין', 'לא', 'כי', 'גם', 'או', 'אם']);

const MOVE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    n: { type: 'INTEGER' },
  },
  required: ['n'],
};

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    h: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['h'],
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loose(title) {
  return normalizeTitle(title).replace(/[-–־'"״׳]/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(title) {
  return loose(title)
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

async function wikiGet(params, attempt = 0) {
  const url = new URL(WIKI);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  url.searchParams.set('maxlag', '5');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: { 'Api-User-Agent': 'WikiWikiReasoner/1.0 (he.wikipedia daily challenge)' },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1);
    await sleep(wait);
    return wikiGet(params, attempt + 1);
  }
  if (!response.ok) throw new Error(`wiki ${response.status}`);
  const data = await response.json();
  if (data?.error?.code === 'maxlag' && attempt < 4) {
    await sleep(1000);
    return wikiGet(params, attempt + 1);
  }
  if (data?.error) throw new Error(data.error.code || 'wiki');
  return data;
}

export async function canonicalArticle(title) {
  const data = await wikiGet({ action: 'query', titles: title, redirects: '1' });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.invalid) return '';
  return normalizeTitle(page.title);
}

async function outgoingLinks(title) {
  await sleep(350);
  const items = [];
  let extra = null;
  let pages = 0;
  do {
    const data = await wikiGet({
      action: 'query',
      titles: title,
      prop: 'links',
      plnamespace: '0',
      pllimit: 'max',
      ...(extra || {}),
    });
    const page = data.query?.pages?.[0];
    if (page?.links) items.push(...page.links.map((link) => normalizeTitle(link.title)));
    extra = data.continue || null;
    pages += 1;
  } while (extra && pages < 6 && items.length < 2500);
  return [...new Set(items.filter(Boolean))];
}

function blockedTitle(title) {
  const prefix = normalizeTitle(title).split(':')[0].trim().toLowerCase();
  return prefix === 'special' || prefix === 'מיוחד';
}

function rankLinks(links, current, goal, hints, visited) {
  const banned = new Set(visited.map((title) => normalizeTitle(title)));
  banned.add(normalizeTitle(current));
  const goalWords = words(goal);
  const hintWords = [...new Set(hints.flatMap(words))];
  const unique = [];
  const seen = new Set();
  links.forEach((title, index) => {
    const name = normalizeTitle(title);
    if (!name || banned.has(name) || seen.has(name) || blockedTitle(name)) return;
    seen.add(name);
    unique.push({ title: name, index });
  });

  function score(item) {
    const text = loose(item.title);
    let value = loose(item.title) === loose(goal) ? 1000 : 0;
    goalWords.forEach((word) => {
      if (text.includes(word)) value += 50;
    });
    hintWords.forEach((word) => {
      if (text.includes(word)) value += 12;
    });
    if (item.index < 12) value += 8;
    else if (item.index < 30) value += 3;
    return value;
  }

  const ranked = unique
    .map((item) => ({ ...item, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = [];
  const used = new Set();
  const take = (item) => {
    if (picked.length >= MAX_LINKS || used.has(item.title)) return;
    picked.push(item.title);
    used.add(item.title);
  };
  ranked.filter((item) => item.score > 0).slice(0, 28).forEach(take);
  unique.filter((item) => item.index < 16).forEach(take);
  ranked.forEach(take);
  return picked;
}

function findGoalLink(links, goal) {
  const want = loose(goal);
  return links.find((title) => loose(title) === want) || '';
}

function cleanHints(value) {
  const hints = [];
  (Array.isArray(value) ? value : []).forEach((item) => {
    const text = normalizeTitle(item).slice(0, 40);
    if (text && !hints.includes(text)) hints.push(text);
  });
  return hints.slice(0, 5);
}

function planPrompt(start, goal) {
  return [
    'משחק ויקיפדיה בעברית. שחקן מגיע מההתחלה אל היעד רק בלחיצה על קישורים.',
    `התחלה: ${start}`,
    `יעד: ${goal}`,
    'החזר עד 5 שמות קצרים של נושאים ששווה לחפש בדרך, מהכללי אל הקרוב ליעד.',
  ].join('\n');
}

function movePrompt(goal, hints, current, choices) {
  const lines = [
    'אתה שחקן במשחק הוויקיפדיה. בחר קישור אחד שמקרב אל היעד לפי הקשר בין השמות.',
    `יעד: ${goal}`,
  ];
  if (hints.length) lines.push(`חפש קשר אל: ${hints.join(', ')}`);
  lines.push(`הדף הנוכחי: ${current}`, 'קישורים:');
  choices.forEach((title, index) => lines.push(`${index + 1}. ${title}`));
  lines.push('החזר רק את מספר הקישור.');
  return lines.join('\n');
}

async function askModel(meta, complete, prompt, schema, maxOutputTokens) {
  if (meta.spentUsd >= MAX_USD || meta.calls >= MAX_CALLS) return null;
  meta.calls += 1;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await complete(prompt, schema, maxOutputTokens);
      meta.spentUsd += result.cost.usd;
      if (result.cost.thoughts > 0 || result.cost.output > 300) meta.stop = true;
      return result;
    } catch (error) {
      if (error.cost) {
        meta.spentUsd += error.cost.usd;
        if (error.cost.thoughts > 0 || error.cost.output > 300) meta.stop = true;
      }
      lastError = error;
      if (meta.stop || (error.status !== 429 && !(error.status >= 500))) break;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function chooseMove(meta, complete, goal, choices) {
  const prompt = movePrompt(goal, meta.hints, meta.path[meta.path.length - 1], choices);
  const pick = (result) => {
    const index = Number(result?.json?.n);
    if (!Number.isInteger(index) || index < 1 || index > choices.length) return '';
    return choices[index - 1];
  };
  const first = await askModel(meta, complete, prompt, MOVE_SCHEMA, 64);
  const chosen = pick(first);
  if (chosen || meta.stop) return chosen;
  const second = await askModel(meta, complete, prompt, MOVE_SCHEMA, 64);
  return pick(second);
}

// `complete(prompt, schema, maxOutputTokens)` returns `{ json, cost }`.
// `onStep(meta, kind)` runs after the plan (`hints`), each page (`page`), and the end (`end`).
export async function playReasoner({
  start,
  goal,
  complete,
  meta: seed,
  onStep,
  probe = false,
}) {
  const meta = {
    path: [start],
    calls: 0,
    spentUsd: 0,
    timeTaken: 0,
    hints: [],
    gaveUp: false,
    stop: false,
    ...(seed || {}),
  };
  if (!meta.path?.length) meta.path = [start];

  const baseTime = meta.timeTaken;
  const origin = Date.now();
  const markTime = () => {
    meta.timeTaken = Number((baseTime + (Date.now() - origin) / 1000).toFixed(3));
  };
  const step = async (kind) => {
    if (onStep) await onStep(meta, kind);
  };

  if (!meta.hints.length && meta.calls === 0 && !sameTitle(start, goal)) {
    const planned = await askModel(meta, complete, planPrompt(start, goal), PLAN_SCHEMA, 100);
    meta.hints = cleanHints(planned?.json?.h);
    if (meta.hints.length) console.log(`hints: ${meta.hints.join(' | ')}`);
    await step('hints');
  }

  while (meta.path.length < REASONER_MAX_PAGES && !sameTitle(meta.path[meta.path.length - 1], goal)) {
    if (meta.stop || meta.spentUsd >= MAX_USD || meta.calls >= MAX_CALLS) break;
    const here = meta.path[meta.path.length - 1];
    const links = await outgoingLinks(here);
    const direct = findGoalLink(links, goal);
    let next = '';
    if (direct) {
      next = await canonicalArticle(direct);
    } else {
      let choices = rankLinks(links, here, goal, meta.hints, meta.path);
      if (!choices.length) break;
      const clicked = await chooseMove(meta, complete, goal, choices);
      if (!clicked) break;
      next = await canonicalArticle(clicked);
      const blocked = (title) => !title || sameTitle(title, here) || meta.path.some((item) => sameTitle(item, title));
      if (blocked(next)) {
        choices = choices.filter((title) => !sameTitle(title, clicked) && !sameTitle(title, next));
        const again = choices.length && !meta.stop ? await chooseMove(meta, complete, goal, choices) : '';
        next = again ? await canonicalArticle(again) : '';
      }
    }
    if (!next || sameTitle(next, here) || meta.path.some((item) => sameTitle(item, next))) break;
    meta.path = [...meta.path, next];
    markTime();
    console.log(`${meta.path.length - 1}. ${next}`);
    await step('page');
    if (probe) break;
    if (meta.stop || meta.spentUsd >= MAX_USD) break;
  }

  const reached = sameTitle(meta.path[meta.path.length - 1], goal);
  meta.gaveUp = !reached;
  markTime();
  await step('end');
  return {
    gaveUp: !reached,
    probe,
    path: meta.path,
    calls: meta.calls,
    spentUsd: meta.spentUsd,
    timeTaken: meta.timeTaken,
    hints: meta.hints,
  };
}
