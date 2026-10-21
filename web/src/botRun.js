import { doc, getDoc, onSnapshot, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { timestampMillis } from './time';
import { israelDateKey, normalizeTitle, resolveStartTitle } from './wikipedia';
import {
  botScoreId,
  canonicalTitle,
  findShortestPath,
  WIKI_BOT_MAX_PAGES,
  WIKI_BOT_NAME,
  WIKI_BOT_UID,
} from './wikiBot';

const LOCK_MS = 4 * 60 * 1000;

const subscribers = new Set();
let phase = 'idle';
let listeners = 0;
let stopSnapshot = null;
let midnightTimer = 0;
let flight = null;
let rerun = false;
const finished = new Set();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setPhase(next) {
  phase = next;
  subscribers.forEach((listener) => listener(phase));
}

export function subscribeBot(listener) {
  listener(phase);
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function msUntilNextIsraelMidnight(now = new Date()) {
  const today = israelDateKey(now);
  let low = now.getTime();
  let high = low + 26 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (israelDateKey(new Date(mid)) === today) low = mid;
    else high = mid;
  }
  return Math.max(1000, high - now.getTime());
}

async function publishScore(ref, data) {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists()) return;
    transaction.set(ref, data);
  });
}

async function claimLock(id) {
  const bucket = Math.floor(Date.now() / LOCK_MS);
  const ref = doc(db, 'scores', `${id}-lock-${bucket}`);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) return false;
      transaction.set(ref, {
        uid: WIKI_BOT_UID,
        name: '',
        bot: true,
        lock: true,
        mode: 'bot-lock',
        pagesVisited: 0,
        timeTaken: 0,
        path: [],
        startTitle: '',
        goalTitle: '',
        timestamp: Timestamp.now(),
      });
      return true;
    });
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waitForScore(ref, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await getDoc(ref);
    if (snap.exists()) return true;
    await sleep(3000);
  }
  return false;
}

async function solveOnce() {
  const snap = await getDoc(doc(db, 'daily', 'articles'));
  if (!snap.exists()) return;
  const data = snap.data();
  const stamp = timestampMillis(data.timestamp);
  if (!stamp || israelDateKey(new Date(stamp)) !== israelDateKey(new Date())) return;

  const goalTitle = normalizeTitle(data.targetArticleTitle);
  const storedStart = await resolveStartTitle(data.startArticleTitle, goalTitle);
  const [start, goal] = await Promise.all([
    canonicalTitle(storedStart),
    canonicalTitle(goalTitle),
  ]);
  const id = botScoreId(stamp, start, goal);
  if (finished.has(id)) return;
  const ref = doc(db, 'scores', id);
  if ((await getDoc(ref)).exists()) {
    finished.add(id);
    return;
  }

  setPhase('running');
  const finish = () => {
    finished.add(id);
    setPhase('done');
  };
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    if ((await getDoc(ref)).exists()) {
      finish();
      return;
    }
    if (!(await claimLock(id))) {
      if (await waitForScore(ref, LOCK_MS)) {
        finish();
        return;
      }
      continue;
    }

    const found = await findShortestPath(start, goal, { maxPages: WIKI_BOT_MAX_PAGES });
    if ((await getDoc(ref)).exists()) {
      finish();
      return;
    }
    if (!found) {
      await publishScore(ref, {
        uid: WIKI_BOT_UID,
        name: '',
        bot: true,
        gaveUp: true,
        mode: 'daily',
        pagesVisited: 0,
        timeTaken: 0,
        path: [],
        startTitle: start,
        goalTitle: goal,
        timestamp: Timestamp.now(),
      });
      finished.add(id);
      return;
    }

    await publishScore(ref, {
      uid: WIKI_BOT_UID,
      name: WIKI_BOT_NAME,
      bot: true,
      mode: 'daily',
      pagesVisited: found.pagesVisited,
      timeTaken: found.timeTaken,
      path: found.path,
      pathVia: Array.isArray(found.via) ? found.via : [],
      startTitle: found.path[0] || start,
      goalTitle: found.path[found.path.length - 1] || goal,
      timestamp: Timestamp.now(),
    });
    finish();
    return;
  }
}

export function ensureDailyBot() {
  if (flight) {
    rerun = true;
    return flight;
  }
  flight = (async () => {
    let attempts = 0;
    do {
      rerun = false;
      try {
        await solveOnce();
        attempts = 0;
      } catch (error) {
        console.error(error);
        attempts += 1;
        if (attempts > 2) return;
        rerun = true;
        await sleep(20000);
      }
    } while (rerun);
  })().finally(() => {
    flight = null;
    if (phase !== 'idle') setPhase('idle');
  });
  return flight;
}

function armMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => {
    const deadline = Date.now() + 3 * 60 * 1000;
    const poll = async () => {
      const snap = await getDoc(doc(db, 'daily', 'articles'));
      const stamp = timestampMillis(snap.data()?.timestamp);
      const ready = stamp && israelDateKey(new Date(stamp)) === israelDateKey(new Date());
      if (ready || Date.now() >= deadline) {
        await ensureDailyBot();
        armMidnight();
        return;
      }
      await sleep(5000);
      if (listeners > 0) await poll();
    };
    poll().catch((error) => console.error(error));
  }, msUntilNextIsraelMidnight() + 20000);
}

export function startDailyBot() {
  listeners += 1;
  if (listeners === 1) {
    stopSnapshot = onSnapshot(doc(db, 'daily', 'articles'), () => {
      ensureDailyBot().catch((error) => console.error(error));
    }, (error) => console.error(error));
    armMidnight();
    ensureDailyBot().catch((error) => console.error(error));
  }
  return () => {
    listeners -= 1;
    if (listeners > 0) return;
    stopSnapshot?.();
    stopSnapshot = null;
    clearTimeout(midnightTimer);
  };
}
