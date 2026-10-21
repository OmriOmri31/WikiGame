// Plays the daily Hebrew Wikipedia game the way a person does: read the links
// on the current article, pick one, repeat. This does not search the link graph.
//
// Model: gemini-3.1-flash-lite, paid standard price checked 18 Oct 2026.
// $0.25 / 1M input tokens, $1.50 / 1M output tokens. Thinking is disabled.
// A full 25-page game is a few agora; the run stops before 0.08 ILS
// (USD/ILS 3.12, above the 3.111 rate of 17 Oct 2026).

import { REASONER_NAME, REASONER_UID, reasonerScoreId } from '../web/src/reasonerBot.js';
import { israelDateKey, normalizeTitle, resolveStartTitle, sameTitle } from '../web/src/wikipedia.js';
import { canonicalArticle, playReasoner } from '../web/src/reasonerPlay.js';
import { geminiComplete } from '../web/src/geminiDirect.js';

const ILS_PER_USD = 3.12;
const PROJECT = 'wikigame-5ebec';
const FIREBASE_KEY = 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ';

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

async function loadDaily() {
  const snap = await readDoc('daily/articles');
  if (!snap) throw new Error('missing daily articles');
  const data = snap.data;
  const stamp = Date.parse(data.timestamp);
  if (!stamp || israelDateKey(new Date(stamp)) !== israelDateKey(new Date())) return null;
  const goalTitle = normalizeTitle(data.targetArticleTitle);
  const storedStart = await resolveStartTitle(data.startArticleTitle, goalTitle);
  const [start, goal] = await Promise.all([canonicalArticle(storedStart), canonicalArticle(goalTitle)]);
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
  for (let length = 2; length <= 25; length += 1) {
    const snap = await readDoc(`scores/${id}-p-${String(length).padStart(2, '0')}`);
    if (!snap?.data?.path) break;
    Object.assign(meta, metaFrom(snap.data, start));
  }
  return { done: false, meta };
}

async function saveHidden(id, suffix, meta) {
  await createDoc('scores', `${id}-${suffix}`, hiddenRecord(meta));
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

  if (alreadyDone || meta.gaveUp || sameTitle(meta.path[meta.path.length - 1], daily.goal)) {
    const baseTime = meta.timeTaken;
    meta.timeTaken = Number((baseTime).toFixed(3));
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

  const result = await playReasoner({
    start: daily.start,
    goal: daily.goal,
    complete: geminiComplete,
    meta,
    probe,
    onStep: async (state, kind) => {
      if (probe) return;
      if (kind === 'hints') await saveHidden(daily.id, 'hints', state);
      if (kind === 'page') await saveHidden(daily.id, `p-${String(state.path.length).padStart(2, '0')}`, state);
      if (kind === 'end') await saveHidden(daily.id, 'end', state);
    },
  });
  if (!probe) await writeScore(daily, result);
  return result;
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
