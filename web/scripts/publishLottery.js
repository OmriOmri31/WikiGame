import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  addIsraelDays,
  drawDistinctPair,
  israelDateKey,
  israelHour,
  sameTitle,
} from '../src/wikipedia.js';
import { israelMidnightMs, liveDailyPair } from '../src/dailyPair.js';
import { canonicalTitle, WIKI_BOT_NAME, WIKI_BOT_UID, botScoreId } from '../src/wikiBot.js';
import { REASONER_NAME, REASONER_UID, reasonerScoreId } from '../src/reasonerBot.js';
import { geminiComplete } from '../src/geminiDirect.js';
import { BFS_MAX_ATTEMPTS, MAX_REDRAWS, confirmBfsResult, runBfs, solvePair } from '../src/lotteryBots.js';
import {
  LOTTERY_DAYS,
  appendPairs,
  normalizeBoard,
  redrawnSlot,
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
const scoreRef = (id) => getFirestore().collection('scores').doc(id);

function credential() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) return cert(JSON.parse(raw));
  const file = new URL('../../firebase-key.json', import.meta.url);
  return cert(JSON.parse(readFileSync(file, 'utf8')));
}

function botMissing(result) {
  return !result || result.status === 'error';
}

// Both bots on a slot. When the pair turns out to have no route at all, a new pair is drawn for
// the slot (marked redrawn on the desk) and solved, up to MAX_REDRAWS times.
async function solveSlot(slot, slots, blocked) {
  let next = { ...slot };
  for (let redraws = 0; ; redraws += 1) {
    const solved = await solvePair(next.startTitle, next.goalTitle, geminiComplete, {
      bfs: next.bfs,
      reasoner: next.reasoner,
    });
    next = { ...next, bfs: solved.bfs, reasoner: solved.reasoner };
    if (!solved.noPath || redraws >= MAX_REDRAWS) return next;
    const taken = takenPairKeys([...slots, next]);
    const pair = await drawDistinctPair(taken, new Date(), blocked);
    console.log(`no route ${next.startTitle} -> ${next.goalTitle}, redrawn as ${pair.start} -> ${pair.goal}`);
    next = redrawnSlot(next, pair);
  }
}

async function usedBlocked() {
  const snap = await usedRef().get();
  return usedTitleSet(snap.exists ? snap.get('titles') : []);
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

// Bot results are saved into the slot they were computed for (original), re-read in a transaction,
// so a pair the admin changed meanwhile keeps its own (cleared) results. A redrawn slot replaces
// the pair too.
async function storeSlot(index, solved, original = solved) {
  await getFirestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(boardRef());
    const board = normalizeBoard(snap.exists ? snap.data() : null);
    const slot = board.slots[index];
    if (!slot || slot.dateKey !== solved.dateKey) return;
    if (!sameTitle(slot.startTitle, original.startTitle) || !sameTitle(slot.goalTitle, original.goalTitle)) return;
    const slots = board.slots.map((entry) => ({ ...entry }));
    slots[index] = {
      ...slot,
      startTitle: solved.startTitle,
      goalTitle: solved.goalTitle,
      bfs: solved.bfs,
      reasoner: solved.reasoner,
      redrawn: solved.redrawn || null,
    };
    transaction.update(boardRef(), { slots });
  });
}

// Bot scores of a pair that was staged for a day and then replaced (the admin changed it).
async function dropStagedScores(start, goal, stamp) {
  const ids = [botScoreId(stamp, start, goal), reasonerScoreId(stamp, start, goal)];
  for (const id of ids) {
    const ref = scoreRef(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const uid = snap.get('uid');
    if (uid !== WIKI_BOT_UID && uid !== REASONER_UID) continue;
    await ref.delete();
    console.log(`removed stale ${id}`);
  }
}

async function loadBoard() {
  const snap = await boardRef().get();
  return normalizeBoard(snap.exists ? snap.data() : null);
}

async function saveBoard(slots, publishedDateKey) {
  await boardRef().set({
    slots,
    publishedDateKey: publishedDateKey || '',
  }, { merge: true });
}

async function saveLastPublished(entry) {
  await boardRef().set({ lastPublished: entry }, { merge: true });
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
    // The Israel day the score belongs to. The leaderboard asks for daily rows by this field.
    dayKey: israelDateKey(new Date(stamp)),
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

async function createBotScores(slot, start, goal, stamp) {
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

// Every pair and its bot scores are stamped at 00:00 Israel time of their day, whenever the job
// actually runs. That keeps the score ids the same for the evening staging and the publish.
async function publishSlot(slot, dateKey) {
  const start = await canonicalTitle(slot.startTitle);
  const goal = await canonicalTitle(slot.goalTitle);
  const stamp = israelMidnightMs(dateKey);
  const before = await dailyRef().get();
  const staged = before.exists ? before.get('next') : null;
  if (staged?.dateKey === dateKey
    && !(sameTitle(staged.startArticleTitle, start) && sameTitle(staged.targetArticleTitle, goal))) {
    await dropStagedScores(staged.startArticleTitle, staged.targetArticleTitle, stamp);
  }
  await dailyRef().set({
    startArticleTitle: start,
    targetArticleTitle: goal,
    timestamp: Timestamp.fromMillis(stamp),
    lotteryDateKey: dateKey,
  });
  await rememberPlayed(start, goal);
  await saveLastPublished({
    startTitle: start,
    goalTitle: goal,
    stamp,
    dateKey,
  });
  console.log(`published ${start} -> ${goal} for ${dateKey}`);
  await createBotScores(slot, start, goal, stamp);
}

// In the evening, put tomorrow's pair in daily/articles.next and create its bot scores stamped
// at the coming midnight. The site switches to it at 00:00 by itself (see src/dailyPair.js), so a
// late or skipped GitHub run at midnight no longer leaves yesterday's pair and table up.
async function stageTomorrow(today) {
  const tomorrow = addIsraelDays(today, 1);
  const snap = await dailyRef().get();
  const staged = snap.exists ? snap.get('next') : null;
  const board = await loadBoard();
  const queued = board.slots[0];
  if (staged?.dateKey === tomorrow && queued?.dateKey === tomorrow
    && sameTitle(staged.startArticleTitle, await canonicalTitle(queued.startTitle))
    && sameTitle(staged.targetArticleTitle, await canonicalTitle(queued.goalTitle))) {
    console.log(`already staged ${tomorrow}`);
    return;
  }
  if (board.publishedDateKey !== today) {
    console.log('today is not published yet, nothing to stage');
    return;
  }
  const slots = board.slots.slice();
  const head = slots[0];
  if (!head?.startTitle || !head?.goalTitle || head.dateKey !== tomorrow) {
    console.log(`queue head is ${head?.dateKey || 'empty'}, not ${tomorrow}`);
    return;
  }
  if (botMissing(head.bfs) || botMissing(head.reasoner)) {
    console.log(`solving ${head.startTitle} -> ${head.goalTitle}`);
    slots[0] = await solveSlot(head, slots, await usedBlocked());
    await saveBoard(slots, board.publishedDateKey);
  }
  const polished = await polishBfs(slots[0]);
  if (polished !== slots[0]) {
    slots[0] = polished;
    await saveBoard(slots, board.publishedDateKey);
  }
  const start = await canonicalTitle(slots[0].startTitle);
  const goal = await canonicalTitle(slots[0].goalTitle);
  const stamp = israelMidnightMs(tomorrow);
  if (staged?.dateKey === tomorrow) {
    // The admin changed tomorrow's pair after it was staged.
    await dropStagedScores(staged.startArticleTitle, staged.targetArticleTitle, stamp);
  }
  await createBotScores(slots[0], start, goal, stamp);
  await dailyRef().set({
    next: {
      startArticleTitle: start,
      targetArticleTitle: goal,
      timestamp: Timestamp.fromMillis(stamp),
      dateKey: tomorrow,
    },
  }, { merge: true });
  console.log(`staged ${start} -> ${goal} for ${tomorrow}`);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// GitHub starts scheduled runs late, so the workflow starts before midnight and waits here.
async function waitForIsraelMidnight() {
  const today = israelDateKey();
  if (israelHour() !== 23) return;
  console.log('waiting for midnight in Israel');
  while (israelDateKey() === today) await sleep(5000);
  await sleep(2000);
}

// Another writer (an old scheduled job outside this repo) can replace the daily pair with a
// random one. Put today's queued pair back if that happened.
async function restorePublished(board, today) {
  const snap = await dailyRef().get();
  const data = snap.exists ? snap.data() : {};
  if (data?.lotteryDateKey === today) return;
  if (data?.next?.dateKey === today) return;
  const kept = board.lastPublished;
  if (!kept?.startTitle || !kept?.goalTitle || kept.dateKey !== today) {
    console.log('daily pair was replaced, and no published pair is stored to restore');
    return;
  }
  await dailyRef().set({
    startArticleTitle: kept.startTitle,
    targetArticleTitle: kept.goalTitle,
    timestamp: Timestamp.fromMillis(kept.stamp),
    lotteryDateKey: today,
  });
  console.log(`restored ${kept.startTitle} -> ${kept.goalTitle}`);
}

const STAGE_FROM_HOUR = 20;

async function main() {
  const hour = israelHour(new Date());
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.env.LOTTERY_FORCE === '1';
  if (hour >= STAGE_FROM_HOUR) {
    try {
      await stageTomorrow(israelDateKey(new Date()));
    } catch (error) {
      console.error(error);
    }
    if (hour !== 23 && !manual) return;
  } else if (!manual && hour > 6) {
    console.log('not near midnight in Israel');
    return;
  }
  await waitForIsraelMidnight();
  const now = new Date();
  const today = israelDateKey(now);
  const usedTitles = await ensureUsedTitles();
  let board = await ensureSlots(usedTitleSet(usedTitles));
  if (board.publishedDateKey === today) {
    console.log('already published');
    await restorePublished(board, today);
    return;
  }

  const slots = board.slots.slice();
  const head = slots[0];
  if (!head?.startTitle || !head?.goalTitle) throw new Error('empty queue');
  if (botMissing(head.bfs) || botMissing(head.reasoner)) {
    console.log(`solving ${head.startTitle} -> ${head.goalTitle}`);
    slots[0] = await solveSlot(head, slots, await usedBlocked());
    await saveBoard(slots, board.publishedDateKey);
  }

  const polished = await polishBfs(slots[0]);
  if (polished !== slots[0]) {
    slots[0] = polished;
    await saveBoard(slots, board.publishedDateKey);
  }

  await publishSlot(slots[0], today);

  const drawn = await drawDistinctPair(takenPairKeys(slots), now, await usedBlocked());
  const shifted = shiftBoard(slots, today, drawn);
  const last = shifted.length - 1;
  console.log(`new fifth ${shifted[last].startTitle} -> ${shifted[last].goalTitle}`);
  await saveBoard(shifted, today);
  console.log(`queue now starts ${shifted[0].dateKey}`);
  await restorePublished(await loadBoard(), today);
}

// Fill in whatever is missing: bot results on queued slots (a failed run, or a pair the admin
// changed with the desk closed), and today's bot scores if they were never written.
async function backfill(today) {
  const snap = await dailyRef().get();
  const live = liveDailyPair(snap.exists ? snap.data() : null);
  if (live.live && live.start && live.goal && live.dateKey === today) {
    const stamp = israelMidnightMs(today);
    const start = await canonicalTitle(live.start);
    const goal = await canonicalTitle(live.goal);
    const [bfsDone, reasonerDone] = await Promise.all([
      scoreRef(botScoreId(stamp, start, goal)).get().then((doc) => doc.exists),
      scoreRef(reasonerScoreId(stamp, start, goal)).get().then((doc) => doc.exists),
    ]);
    if (!bfsDone || !reasonerDone) {
      console.log(`today's bot scores missing (${bfsDone ? '' : 'bfs '}${reasonerDone ? '' : 'reasoner'}), solving ${start} -> ${goal}`);
      // Today's pair is already live, so a pair with no route is not redrawn here.
      const solved = await solvePair(start, goal, geminiComplete, {
        bfs: bfsDone ? { status: 'done' } : null,
        reasoner: reasonerDone ? { status: 'done' } : null,
      });
      const bfs = bfsDone || botMissing(solved.bfs) ? null : solved.bfs;
      const reasoner = reasonerDone || botMissing(solved.reasoner) ? null : solved.reasoner;
      await createBotScores({ bfs, reasoner }, start, goal, stamp);
    }
  }

  // Scheduled runs late in the evening leave the queue alone, so they never hold up the midnight run.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (process.env.GITHUB_EVENT_NAME === 'schedule' && hour >= 21) {
    console.log('late evening, queue backfill skipped');
    return;
  }

  const board = await loadBoard();
  const blocked = await usedBlocked();
  const slots = board.slots.map((slot) => ({ ...slot }));
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!slotNeedsSolving(slot)) continue;
    console.log(`solving slot ${slot.dateKey}: ${slot.startTitle} -> ${slot.goalTitle}`);
    const solved = await solveSlot(slot, slots, blocked);
    await storeSlot(index, solved, slot);
    slots[index] = solved;
  }
}

// A search that already failed all its attempts is tried again by a manual run, or at midnight,
// not by every scheduled run.
function slotNeedsSolving(slot) {
  if (!slot.startTitle || !slot.goalTitle) return false;
  const spent = slot.bfs?.status === 'error' && slot.bfs.attempts >= BFS_MAX_ATTEMPTS
    && process.env.GITHUB_EVENT_NAME === 'schedule';
  return (botMissing(slot.bfs) && !spent) || botMissing(slot.reasoner);
}

// Read-only report of what a real run would do. LOTTERY_DRY_RUN=1.
async function dryRun() {
  const now = new Date();
  const today = israelDateKey(now);
  const board = await loadBoard();
  const snap = await dailyRef().get();
  const data = snap.exists ? snap.data() : null;
  const live = liveDailyPair(data, now);
  console.log(`israel ${today} hour ${israelHour(now)}; queue published for ${board.publishedDateKey || '-'}`);
  console.log(`live pair: ${live.start} -> ${live.goal} (${live.dateKey}, live=${live.live})`);
  console.log(`staged next: ${data?.next ? `${data.next.startArticleTitle} -> ${data.next.targetArticleTitle} (${data.next.dateKey})` : '-'}`);
  if (live.live && live.start && live.goal) {
    const stamp = israelMidnightMs(live.dateKey);
    const start = await canonicalTitle(live.start);
    const goal = await canonicalTitle(live.goal);
    const bfs = (await scoreRef(botScoreId(stamp, start, goal)).get()).exists;
    const reasoner = (await scoreRef(reasonerScoreId(stamp, start, goal)).get()).exists;
    console.log(`today's bot scores: bfs=${bfs ? 'stored' : 'MISSING'} reasoner=${reasoner ? 'stored' : 'MISSING'}`);
  }
  const describe = (result) => {
    if (!result) return 'none';
    if (result.status === 'error') return `error (${result.error})${result.attempts ? ` after ${result.attempts} attempts` : ''}`;
    if (result.gaveUp) return `gave up after ${result.pagesVisited}`;
    return `${result.pagesVisited} pages${result.checked ? '' : ' (unchecked)'}${result.attempts > 1 ? ` (attempt ${result.attempts})` : ''}`;
  };
  board.slots.forEach((slot) => {
    const missing = slotNeedsSolving(slot);
    const redrawn = slot.redrawn ? ` | redrawn ${slot.redrawn.count}x from ${slot.redrawn.startTitle} -> ${slot.redrawn.goalTitle}` : '';
    console.log(`slot ${slot.dateKey}: ${slot.startTitle} -> ${slot.goalTitle} | bfs ${describe(slot.bfs)} | reasoner ${describe(slot.reasoner)}${redrawn}${missing ? ' | WOULD SOLVE' : ''}`);
  });
}

async function run() {
  if (process.env.LOTTERY_DRY_RUN === '1') {
    await dryRun();
    return;
  }
  await main();
  try {
    await backfill(israelDateKey(new Date()));
  } catch (error) {
    console.error(error);
  }
  // A search that ran out of time may still have requests open.
  process.exit(0);
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

  if (!process.env.GEMINI_API_KEY && process.env.LOTTERY_DRY_RUN !== '1') {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
  }

  run().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
