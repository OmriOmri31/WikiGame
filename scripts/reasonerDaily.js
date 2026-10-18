// Plays the daily Hebrew Wikipedia game the way a person does: read the links
// on the current article, pick one, repeat. This does not search the link graph.
//
// Model: gemini-3.1-flash-lite, paid standard price checked 18 Oct 2026.
// $0.25 / 1M input tokens, $1.50 / 1M output tokens. Thinking is disabled.
// A full 25-page game is a few agora; the run stops before 0.08 ILS
// (USD/ILS 3.12, above the 3.111 rate of 17 Oct 2026).

import { REASONER_MAX_PAGES, REASONER_NAME, REASONER_UID, reasonerScoreId } from '../web/src/reasonerBot.js';
import { israelDateKey, normalizeTitle, resolveStartTitle, sameTitle } from '../web/src/wikipedia.js';

const MODEL = 'gemini-3.1-flash-lite';
const INPUT_USD = 0.25 / 1e6;
const OUTPUT_USD = 1.50 / 1e6;
const ILS_PER_USD = 3.12;
const MAX_USD = 0.08 / ILS_PER_USD;
const MAX_CALLS = 32;
const MAX_LINKS = 40;
const PROJECT = 'wikigame-5ebec';
const FIREBASE_KEY = 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ';
const WIKI = 'https://he.wikipedia.org/w/api.php';

const STOP_WORDS = new Set(['של', 'על', 'עם', 'אל', 'את', 'הוא', 'היא', 'זה', 'זו', 'בין', 'לא', 'כי', 'גם', 'או', 'אם']);

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

function field(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  throw new Error('unsupported field');
}

function valueOf(entry) {
  if (!entry) return undefined;
  if ('stringValue' in entry) return entry.stringValue;
  if ('integerValue' in entry) return Number(entry.integerValue);
  if ('doubleValue' in entry) return Number(entry.doubleValue);
  if ('booleanValue' in entry) return entry.booleanValue;
  if ('timestampValue' in entry) return entry.timestampValue;
  if ('arrayValue' in entry) return (entry.arrayValue.values || []).map(valueOf);
  return undefined;
}

function decodeFields(fields) {
  const data = {};
  Object.entries(fields || {}).forEach(([key, entry]) => {
    data[key] = valueOf(entry);
  });
  return data;
}

function firestoreUrl(path, query = '') {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}?key=${FIREBASE_KEY}${query}`;
}

async function readDoc(path) {
  const response = await fetch(firestoreUrl(path));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`firestore read ${response.status} ${path}`);
  const body = await response.json();
  return { data: decodeFields(body.fields), createTime: body.createTime || '' };
}

async function createDoc(collectionPath, id, data) {
  const response = await fetch(firestoreUrl(collectionPath, `&documentId=${encodeURIComponent(id)}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) }),
  });
  if (response.status === 409) return false;
  if (!response.ok) throw new Error(`firestore create ${response.status} ${collectionPath}/${id}`);
  return true;
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

async function canonical(title) {
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

function usageCost(usage) {
  const input = Number(usage?.promptTokenCount) || 0;
  const thoughts = Number(usage?.thoughtsTokenCount) || 0;
  let output = (Number(usage?.candidatesTokenCount) || 0) + thoughts;
  if (!input && !output) output = Number(usage?.totalTokenCount) || 0;
  return {
    usd: input * INPUT_USD + output * OUTPUT_USD,
    input,
    output,
    thoughts,
  };
}

async function gemini(prompt, schema, maxOutputTokens) {
  if (prompt.length > 4000) throw new Error('prompt too long');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });
  const body = await response.json();
  const cost = usageCost(body.usageMetadata);
  if (!response.ok) {
    const message = body?.error?.message || `gemini ${response.status}`;
    const error = new Error(message.slice(0, 180));
    error.status = response.status;
    throw error;
  }
  const parts = body.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => !part.thought).map((part) => part.text || '').join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    const finish = body.candidates?.[0]?.finishReason || '';
    const error = new Error(`empty model response ${finish} in=${cost.input} out=${cost.output} thoughts=${cost.thoughts} text=${JSON.stringify(text).slice(0, 120)}`);
    error.cost = cost;
    throw error;
  }
  try {
    return { json: JSON.parse(text.slice(start, end + 1)), cost };
  } catch (error) {
    error.cost = cost;
    throw error;
  }
}

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

async function loadDaily() {
  const snap = await readDoc('daily/articles');
  if (!snap) throw new Error('missing daily articles');
  const data = snap.data;
  const stamp = Date.parse(data.timestamp);
  if (!stamp || israelDateKey(new Date(stamp)) !== israelDateKey(new Date())) return null;
  const goalTitle = normalizeTitle(data.targetArticleTitle);
  const storedStart = await resolveStartTitle(data.startArticleTitle, goalTitle);
  const [start, goal] = await Promise.all([canonical(storedStart), canonical(goalTitle)]);
  if (!start || !goal) throw new Error('missing article');
  return { stamp, start, goal, id: reasonerScoreId(stamp, start, goal) };
}

function metaFrom(data, start) {
  const path = Array.isArray(data.path) ? data.path.map((title) => normalizeTitle(title)).filter(Boolean) : [];
  return {
    path: path.length ? path : [start],
    calls: Number(data.calls) || 0,
    spentUsd: Number(data.spentUsd) || 0,
    timeTaken: Number(data.timeTaken) || 0,
    hints: Array.isArray(data.hints) ? data.hints.map((hint) => normalizeTitle(hint)).filter(Boolean) : [],
    gaveUp: Boolean(data.gaveUp),
  };
}

function hiddenRecord(meta) {
  return {
    lock: true,
    mode: 'bot-lock',
    name: '',
    uid: REASONER_UID,
    path: meta.path,
    calls: meta.calls,
    spentUsd: meta.spentUsd,
    timeTaken: meta.timeTaken,
    gaveUp: meta.gaveUp,
    ...(meta.hints.length ? { hints: meta.hints } : {}),
  };
}

async function loadProgress(id, start) {
  const done = await readDoc(`scores/${id}-end`);
  if (done?.data?.path) return { done: true, meta: metaFrom(done.data, start) };

  const meta = {
    path: [start],
    calls: 0,
    spentUsd: 0,
    timeTaken: 0,
    hints: [],
    gaveUp: false,
  };
  const hints = await readDoc(`scores/${id}-hints`);
  if (hints?.data) Object.assign(meta, metaFrom({ ...meta, ...hints.data }, start));
  for (let length = 2; length <= REASONER_MAX_PAGES; length += 1) {
    const snap = await readDoc(`scores/${id}-p-${String(length).padStart(2, '0')}`);
    if (!snap?.data?.path) break;
    Object.assign(meta, metaFrom(snap.data, start));
  }
  return { done: false, meta };
}

async function saveHidden(id, suffix, meta) {
  await createDoc('scores', `${id}-${suffix}`, hiddenRecord(meta));
}

async function askModel(meta, prompt, schema, maxOutputTokens) {
  if (meta.spentUsd >= MAX_USD || meta.calls >= MAX_CALLS) return null;
  meta.calls += 1;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await gemini(prompt, schema, maxOutputTokens);
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

async function chooseMove(daily, meta, choices) {
  const prompt = movePrompt(daily.goal, meta.hints, meta.path[meta.path.length - 1], choices);
  const pick = (result) => {
    const index = Number(result?.json?.n);
    if (!Number.isInteger(index) || index < 1 || index > choices.length) return '';
    return choices[index - 1];
  };
  const first = await askModel(meta, prompt, MOVE_SCHEMA, 64);
  const chosen = pick(first);
  if (chosen || meta.stop) return chosen;
  const second = await askModel(meta, prompt, MOVE_SCHEMA, 64);
  return pick(second);
}

async function writeScore(daily, meta) {
  const reached = sameTitle(meta.path[meta.path.length - 1], daily.goal);
  const gaveUp = !reached;
  const created = await createDoc('scores', daily.id, {
    uid: REASONER_UID,
    name: REASONER_NAME,
    reasoner: true,
    mode: 'daily',
    pagesVisited: meta.path.length,
    timeTaken: meta.timeTaken,
    path: meta.path,
    startTitle: meta.path[0] || daily.start,
    goalTitle: reached ? meta.path[meta.path.length - 1] : daily.goal,
    timestamp: new Date(),
    ...(gaveUp ? { gaveUp: true } : {}),
  });
  if (!created) console.log('score already stored');
  return { gaveUp, created };
}

async function playToday({ probe }) {
  const daily = await loadDaily();
  if (!daily) {
    console.log('daily puzzle is not ready');
    return null;
  }
  console.log(`${daily.start} -> ${daily.goal}`);
  if (!probe && await readDoc(`scores/${daily.id}`)) {
    console.log('already scored');
    return null;
  }

  let meta = {
    path: [daily.start],
    calls: 0,
    spentUsd: 0,
    timeTaken: 0,
    hints: [],
    gaveUp: false,
    stop: false,
  };
  let alreadyDone = false;
  if (!probe) {
    const loaded = await loadProgress(daily.id, daily.start);
    meta = { ...loaded.meta, stop: false };
    alreadyDone = loaded.done;
  }

  const baseTime = meta.timeTaken;
  const origin = Date.now();
  const markTime = () => {
    meta.timeTaken = Number((baseTime + (Date.now() - origin) / 1000).toFixed(3));
  };

  if (alreadyDone || meta.gaveUp || sameTitle(meta.path[meta.path.length - 1], daily.goal)) {
    markTime();
    if (!probe) {
      if (!alreadyDone) await saveHidden(daily.id, 'end', meta);
      await writeScore(daily, meta);
    }
    return {
      gaveUp: !sameTitle(meta.path[meta.path.length - 1], daily.goal),
      path: meta.path,
      calls: meta.calls,
      spentUsd: meta.spentUsd,
      timeTaken: meta.timeTaken,
    };
  }

  if (!meta.hints.length && meta.calls === 0 && !sameTitle(daily.start, daily.goal)) {
    const planned = await askModel(meta, planPrompt(daily.start, daily.goal), PLAN_SCHEMA, 100);
    meta.hints = cleanHints(planned?.json?.h);
    if (meta.hints.length) console.log(`hints: ${meta.hints.join(' | ')}`);
    if (!probe) await saveHidden(daily.id, 'hints', meta);
  }

  while (meta.path.length < REASONER_MAX_PAGES && !sameTitle(meta.path[meta.path.length - 1], daily.goal)) {
    if (meta.stop || meta.spentUsd >= MAX_USD || meta.calls >= MAX_CALLS) break;
    const here = meta.path[meta.path.length - 1];
    const links = await outgoingLinks(here);
    const direct = findGoalLink(links, daily.goal);
    let next = '';
    if (direct) {
      next = await canonical(direct);
    } else {
      let choices = rankLinks(links, here, daily.goal, meta.hints, meta.path);
      if (!choices.length) break;
      const clicked = await chooseMove(daily, meta, choices);
      if (!clicked) break;
      next = await canonical(clicked);
      const blocked = (title) => !title || sameTitle(title, here) || meta.path.some((step) => sameTitle(step, title));
      if (blocked(next)) {
        choices = choices.filter((title) => !sameTitle(title, clicked) && !sameTitle(title, next));
        const again = choices.length && !meta.stop ? await chooseMove(daily, meta, choices) : '';
        next = again ? await canonical(again) : '';
      }
    }
    if (!next || sameTitle(next, here) || meta.path.some((step) => sameTitle(step, next))) break;
    meta.path = [...meta.path, next];
    markTime();
    console.log(`${meta.path.length - 1}. ${next}`);
    if (!probe) await saveHidden(daily.id, `p-${String(meta.path.length).padStart(2, '0')}`, meta);
    if (probe) break;
    if (meta.stop || meta.spentUsd >= MAX_USD) break;
  }

  const reached = sameTitle(meta.path[meta.path.length - 1], daily.goal);
  meta.gaveUp = !reached;
  markTime();
  if (!probe) {
    await saveHidden(daily.id, 'end', meta);
    await writeScore(daily, meta);
  }
  return {
    gaveUp: !reached,
    probe,
    path: meta.path,
    calls: meta.calls,
    spentUsd: meta.spentUsd,
    timeTaken: meta.timeTaken,
  };
}

const probe = process.argv.includes('--probe');
if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

playToday({ probe }).then((result) => {
  if (!result) return;
  const ils = result.spentUsd * ILS_PER_USD;
  console.log(JSON.stringify({
    status: result.probe && result.gaveUp ? 'probe' : (result.gaveUp ? 'gave-up' : 'solved'),
    pages: result.path.length,
    calls: result.calls,
    usd: Number(result.spentUsd.toFixed(6)),
    ils: Number(ils.toFixed(4)),
    seconds: result.timeTaken,
    path: result.path,
  }));
  if (ils > 0.1) {
    console.error('cost exceeded 0.1 ILS');
    process.exit(2);
  }
}).catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
