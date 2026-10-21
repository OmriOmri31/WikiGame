import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import {
  drawDistinctPair,
  israelDateKey,
  israelHour,
} from '../src/wikipedia.js';
import { canonicalTitle, WIKI_BOT_NAME, WIKI_BOT_UID, botScoreId } from '../src/wikiBot.js';
import { REASONER_NAME, REASONER_UID, reasonerScoreId } from '../src/reasonerBot.js';
import { geminiComplete } from '../src/geminiDirect.js';
import { runBfs, runReasoner } from '../src/lotteryBots.js';
import {
  LOTTERY_DAYS,
  appendPairs,
  normalizeBoard,
  shiftBoard,
  takenPairKeys,
} from '../src/lotteryModel.js';

const boardRef = () => admin.firestore().collection('lotteryQueue').doc('board');
const dailyRef = () => admin.firestore().collection('daily').doc('articles');

function credential() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) return admin.credential.cert(JSON.parse(raw));
  const file = new URL('../../firebase-key.json', import.meta.url);
  return admin.credential.cert(JSON.parse(readFileSync(file, 'utf8')));
}

function botMissing(result) {
  return !result || result.status === 'error';
}

async function solveSlot(slot) {
  const next = { ...slot };
  if (botMissing(next.bfs)) next.bfs = await runBfs(next.startTitle, next.goalTitle);
  if (botMissing(next.reasoner)) {
    next.reasoner = await runReasoner(next.startTitle, next.goalTitle, geminiComplete);
  }
  return next;
}

async function loadBoard() {
  const snap = await boardRef().get();
  return normalizeBoard(snap.exists ? snap.data() : null);
}

async function saveBoard(slots, publishedDateKey) {
  await boardRef().set({
    slots,
    publishedDateKey: publishedDateKey || '',
  });
}

async function ensureSlots() {
  let board = await loadBoard();
  if (board.slots.length >= LOTTERY_DAYS && board.slots.every((slot) => slot.startTitle && slot.goalTitle)) {
    return board;
  }
  const slots = await appendPairs(board.slots, (taken) => drawDistinctPair(taken));
  await saveBoard(slots, board.publishedDateKey);
  board = await loadBoard();
  return board;
}

function scoreBody(kind, result, start, goal, stamp) {
  const reached = !result.gaveUp;
  const goalTitle = reached ? (result.path[result.path.length - 1] || goal) : goal;
  const base = {
    mode: 'daily',
    pagesVisited: result.pagesVisited,
    timeTaken: result.timeTaken,
    path: result.path,
    startTitle: result.path[0] || start,
    goalTitle,
    timestamp: admin.firestore.Timestamp.fromMillis(stamp),
    ...(result.gaveUp ? { gaveUp: true } : {}),
  };
  if (kind === 'bfs') {
    return {
      ...base,
      uid: WIKI_BOT_UID,
      name: result.gaveUp ? '' : WIKI_BOT_NAME,
      bot: true,
      pathVia: result.pathVia || [],
    };
  }
  return {
    ...base,
    uid: REASONER_UID,
    name: REASONER_NAME,
    reasoner: true,
  };
}

async function createScore(id, data) {
  try {
    await admin.firestore().collection('scores').doc(id).create(data);
    console.log(`stored ${id}`);
  } catch (error) {
    if (error?.code === 6 || error?.code === 'already-exists') {
      console.log(`score exists ${id}`);
      return;
    }
    throw error;
  }
}

async function publishSlot(slot) {
  const start = await canonicalTitle(slot.startTitle);
  const goal = await canonicalTitle(slot.goalTitle);
  const stamp = Date.now();
  await dailyRef().set({
    startArticleTitle: start,
    targetArticleTitle: goal,
    timestamp: admin.firestore.Timestamp.fromMillis(stamp),
    lotteryDateKey: israelDateKey(new Date(stamp)),
  });
  console.log(`published ${start} -> ${goal}`);
  if (slot.bfs && slot.bfs.status !== 'error') {
    await createScore(botScoreId(stamp, start, goal), scoreBody('bfs', slot.bfs, start, goal, stamp));
  }
  if (slot.reasoner && slot.reasoner.status !== 'error') {
    await createScore(
      reasonerScoreId(stamp, start, goal),
      scoreBody('reasoner', slot.reasoner, start, goal, stamp),
    );
  }
}

async function main() {
  const now = new Date();
  // The winter run of the 21:00 UTC cron lands at 23:00, still before midnight.
  if (israelHour(now) === 23) {
    console.log('before midnight in Israel');
    return;
  }
  const today = israelDateKey(now);
  let board = await ensureSlots();
  if (board.publishedDateKey === today) {
    console.log('already published');
    return;
  }

  const slots = board.slots.slice();
  for (let index = 0; index < slots.length; index += 1) {
    if (!botMissing(slots[index].bfs) && !botMissing(slots[index].reasoner)) continue;
    console.log(`solving ${slots[index].startTitle} -> ${slots[index].goalTitle}`);
    slots[index] = await solveSlot(slots[index]);
    await saveBoard(slots, board.publishedDateKey);
  }

  const ready = slots[0];
  if (!ready?.startTitle || !ready?.goalTitle) throw new Error('empty queue');
  await publishSlot(ready);

  const drawn = await drawDistinctPair(takenPairKeys(slots));
  const shifted = shiftBoard(slots, today, drawn);
  const last = shifted.length - 1;
  console.log(`new fifth ${shifted[last].startTitle} -> ${shifted[last].goalTitle}`);
  try {
    shifted[last] = await solveSlot(shifted[last]);
  } catch (error) {
    console.error(error);
  }
  await saveBoard(shifted, today);
  console.log(`queue now starts ${shifted[0].dateKey}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    admin.initializeApp({ credential: credential() });
  } catch (error) {
    console.error(error?.message || error);
    console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON, or place firebase-key.json at the repo root.');
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
  }

  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
