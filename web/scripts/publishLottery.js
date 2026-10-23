import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  drawDistinctPair,
  israelDateKey,
  israelHour,
} from '../src/wikipedia.js';
import { canonicalTitle, WIKI_BOT_NAME, WIKI_BOT_UID, botScoreId } from '../src/wikiBot.js';
import { REASONER_NAME, REASONER_UID, reasonerScoreId } from '../src/reasonerBot.js';
import { geminiComplete } from '../src/geminiDirect.js';
import { confirmBfsResult, runBfs, runReasoner } from '../src/lotteryBots.js';
import {
  LOTTERY_DAYS,
  appendPairs,
  normalizeBoard,
  shiftBoard,
  takenPairKeys,
} from '../src/lotteryModel.js';
import {
  USED_COLLECTION,
  USED_DOCUMENT,
  mergeUsedTitles,
  normalizeUsedTitles,
  sameTitleList,
  usedTitleSet,
  withSeedTitles,
} from '../src/usedArticles.js';

const boardRef = () => getFirestore().collection('lotteryQueue').doc('board');
const dailyRef = () => getFirestore().collection('daily').doc('articles');
const usedRef = () => getFirestore().collection(USED_COLLECTION).doc(USED_DOCUMENT);

function credential() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) return cert(JSON.parse(raw));
  const file = new URL('../../firebase-key.json', import.meta.url);
  return cert(JSON.parse(readFileSync(file, 'utf8')));
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

async function polishBfs(slot) {
  if (botMissing(slot.bfs) || slot.bfs.gaveUp) return slot;
  const confirmed = await confirmBfsResult(slot.bfs);
  if (botMissing(confirmed)) {
    console.log(`rechecking ${slot.startTitle} -> ${slot.goalTitle}`);
    return { ...slot, bfs: await runBfs(slot.startTitle, slot.goalTitle) };
  }
  if (!confirmed?.checked) throw new Error('unverified path');
  if (confirmed === slot.bfs) return slot;
  return { ...slot, bfs: confirmed };
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

async function ensureUsedTitles() {
  return getFirestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(usedRef());
    const stored = normalizeUsedTitles(snap.exists ? snap.get('titles') : []);
    const next = withSeedTitles(stored);
    if (!sameTitleList(stored, next)) transaction.set(usedRef(), { titles: next });
    return next;
  });
}

async function rememberPlayed(start, goal) {
  return getFirestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(usedRef());
    const stored = normalizeUsedTitles(snap.exists ? snap.get('titles') : []);
    const next = mergeUsedTitles(stored, [start, goal]);
    if (!sameTitleList(stored, next)) transaction.set(usedRef(), { titles: next });
    return next;
  });
}

async function ensureSlots(blocked) {
  let board = await loadBoard();
  if (board.slots.length >= LOTTERY_DAYS && board.slots.every((slot) => slot.startTitle && slot.goalTitle)) {
    return board;
  }
  const slots = await appendPairs(
    board.slots,
    (taken) => drawDistinctPair(taken, new Date(), blocked),
  );
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
    timestamp: Timestamp.fromMillis(stamp),
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
    await getFirestore().collection('scores').doc(id).create(data);
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
    timestamp: Timestamp.fromMillis(stamp),
    lotteryDateKey: israelDateKey(new Date(stamp)),
  });
  await rememberPlayed(start, goal);
  console.log(`published ${start} -> ${goal}`);
  if (slot.bfs && slot.bfs.status !== 'error') {
    const linked = !slot.bfs.gaveUp && Array.isArray(slot.bfs.path) && slot.bfs.path.length > 1;
    if (linked && !slot.bfs.checked) throw new Error('unverified path');
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
  const usedTitles = await ensureUsedTitles();
  let board = await ensureSlots(usedTitleSet(usedTitles));
  if (board.publishedDateKey === today) {
    console.log('already published');
    return;
  }

  const slots = board.slots.slice();
  const head = slots[0];
  if (!head?.startTitle || !head?.goalTitle) throw new Error('empty queue');
  if (botMissing(head.bfs) || botMissing(head.reasoner)) {
    console.log(`solving ${head.startTitle} -> ${head.goalTitle}`);
    slots[0] = await solveSlot(head);
    await saveBoard(slots, board.publishedDateKey);
  }

  const polished = await polishBfs(slots[0]);
  if (polished !== slots[0]) {
    slots[0] = polished;
    await saveBoard(slots, board.publishedDateKey);
  }

  await publishSlot(slots[0]);

  const usedSnap = await usedRef().get();
  const blocked = usedTitleSet(usedSnap.exists ? usedSnap.get('titles') : []);
  const drawn = await drawDistinctPair(takenPairKeys(slots), now, blocked);
  const shifted = shiftBoard(slots, today, drawn);
  const last = shifted.length - 1;
  console.log(`new fifth ${shifted[last].startTitle} -> ${shifted[last].goalTitle}`);
  await saveBoard(shifted, today);
  console.log(`queue now starts ${shifted[0].dateKey}`);

  try {
    if (botMissing(shifted[last].bfs) || botMissing(shifted[last].reasoner)) {
      shifted[last] = await solveSlot(shifted[last]);
      await saveBoard(shifted, today);
    }
    for (let index = 0; index < last; index += 1) {
      if (!botMissing(shifted[index].bfs) && !botMissing(shifted[index].reasoner)) continue;
      console.log(`solving ${shifted[index].startTitle} -> ${shifted[index].goalTitle}`);
      shifted[index] = await solveSlot(shifted[index]);
      await saveBoard(shifted, today);
    }
  } catch (error) {
    console.error(error);
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    initializeApp({ credential: credential() });
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
