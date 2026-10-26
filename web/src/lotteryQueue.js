/* global __WIKIGAME_TEST__ */
import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isTestAdmin, onTestDeskPage } from './testSite';
import { drawDistinctPair, normalizeTitle, sameTitle } from './wikipedia.js';
import { confirmedArticle } from './wikiBot.js';
import {
  appendPairs,
  boardReady,
  normalizeBoard,
  pairKey,
  redrawnSlot,
  takenPairKeys,
} from './lotteryModel.js';
import {
  USED_COLLECTION,
  USED_DOCUMENT,
  normalizeUsedTitles,
  pairBlocked,
  sameTitleList,
  usedTitleSet,
  withSeedTitles,
} from './usedArticles.js';

// The test site's test admin and its unlisted queue page get their own copy of the queue, so they
// can never change the real one. Production builds compile this down to 'lotteryQueue'.
function queueCollection() {
  return __WIKIGAME_TEST__ && (onTestDeskPage() || isTestAdmin(auth.currentUser)) ? 'lotteryQueue_test' : 'lotteryQueue';
}

function boardDoc() {
  return doc(db, queueCollection(), 'board');
}

function usedDoc() {
  const name = queueCollection();
  return doc(db, name === 'lotteryQueue' ? USED_COLLECTION : name, USED_DOCUMENT);
}
let filling = null;

function cloneSlots(slots) {
  return slots.map((slot) => ({ ...slot }));
}

export function subscribeQueue(listener) {
  return onSnapshot(boardDoc(), (snap) => {
    listener(snap.exists() ? normalizeBoard(snap.data()) : normalizeBoard(null));
  }, (error) => {
    console.error(error);
    listener(null, error);
  });
}

export function ensureQueue() {
  if (!filling) {
    filling = fillQueue().finally(() => {
      filling = null;
    });
  }
  return filling;
}

async function blockedTitles() {
  const snap = await getDoc(usedDoc());
  return usedTitleSet(snap.exists() ? snap.data()?.titles : []);
}

export function subscribeUsedTitles(listener) {
  return onSnapshot(usedDoc(), (snap) => {
    listener(normalizeUsedTitles(snap.exists() ? snap.data()?.titles : []));
  }, (error) => {
    console.error(error);
    listener(null, error);
  });
}

export async function ensureUsedTitles() {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(usedDoc());
    const stored = normalizeUsedTitles(snap.exists() ? snap.data()?.titles : []);
    const next = withSeedTitles(stored);
    if (sameTitleList(stored, next)) return;
    transaction.set(usedDoc(), { titles: next });
  });
}

async function fillQueue() {
  for (let pass = 0; pass < 3; pass += 1) {
    const snap = await getDoc(boardDoc());
    const board = normalizeBoard(snap.exists() ? snap.data() : null);
    if (boardReady(board)) return;
    const blocked = await blockedTitles();
    const drawn = await appendPairs(board.slots, (taken) => drawDistinctPair(taken, new Date(), blocked));
    let done = false;
    try {
      done = await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(boardDoc());
      const usedSnap = await transaction.get(usedDoc());
      const current = normalizeBoard(fresh.exists() ? fresh.data() : null);
      if (boardReady(current)) return true;
      const liveBlocked = usedTitleSet(usedSnap.exists() ? usedSnap.data()?.titles : []);
      const merged = await appendPairs(current.slots, async (taken) => {
        const match = drawn.find((slot) => (
          !taken.has(pairKey(slot.startTitle, slot.goalTitle))
          && !pairBlocked(slot.startTitle, slot.goalTitle, liveBlocked)
        ));
        if (!match) throw new Error('pair');
        taken.add(pairKey(match.startTitle, match.goalTitle));
        return { start: match.startTitle, goal: match.goalTitle };
      });
      transaction.set(boardDoc(), {
        slots: merged,
        publishedDateKey: current.publishedDateKey,
      });
      return boardReady(normalizeBoard({ slots: merged }));
    });
    } catch (error) {
      if (pass === 2) throw error;
      continue;
    }
    if (done) return;
  }
  throw new Error('queue');
}

export async function updateSlotTitles(index, startTitle, goalTitle) {
  const [start, goal] = await Promise.all([
    confirmedArticle(startTitle),
    confirmedArticle(goalTitle),
  ]);
  if (!start || !goal) {
    const error = new Error('missing');
    error.code = 'missingtitle';
    throw error;
  }
  if (sameTitle(start, goal)) {
    const error = new Error('same');
    error.code = 'same';
    throw error;
  }
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(boardDoc());
    if (!snap.exists()) throw new Error('queue');
    const board = normalizeBoard(snap.data());
    const slot = board.slots[index];
    if (!slot) throw new Error('queue');
    const slots = cloneSlots(board.slots);
    const samePair = sameTitle(slot.startTitle, start) && sameTitle(slot.goalTitle, goal);
    slots[index] = {
      ...slot,
      startTitle: start,
      goalTitle: goal,
      bfs: samePair ? slot.bfs : null,
      reasoner: samePair ? slot.reasoner : null,
      redrawn: samePair ? slot.redrawn : null,
    };
    transaction.update(boardDoc(), { slots });
  });
  return { start, goal };
}

export async function saveSlotResult(index, key, startTitle, goalTitle, result) {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(boardDoc());
    if (!snap.exists()) return;
    const board = normalizeBoard(snap.data());
    const slot = board.slots[index];
    if (!slot) return;
    if (!sameTitle(slot.startTitle, startTitle) || !sameTitle(slot.goalTitle, goalTitle)) return;
    const slots = cloneSlots(board.slots);
    slots[index] = { ...slot, [key]: result };
    transaction.update(boardDoc(), { slots });
  });
}

// The bots found that a slot's pair has no route: draw a new pair for it. Returns the new pair,
// or null when the slot no longer holds that pair (the admin changed it meanwhile).
export async function redrawSlot(index, startTitle, goalTitle) {
  const snap = await getDoc(boardDoc());
  const board = normalizeBoard(snap.exists() ? snap.data() : null);
  const pair = await drawDistinctPair(takenPairKeys(board.slots), new Date(), await blockedTitles());
  return runTransaction(db, async (transaction) => {
    const fresh = await transaction.get(boardDoc());
    if (!fresh.exists()) return null;
    const current = normalizeBoard(fresh.data());
    const slot = current.slots[index];
    if (!slot || !sameTitle(slot.startTitle, startTitle) || !sameTitle(slot.goalTitle, goalTitle)) return null;
    if (takenPairKeys(current.slots).has(pairKey(pair.start, pair.goal))) throw new Error('pair');
    const slots = cloneSlots(current.slots);
    slots[index] = redrawnSlot(slot, pair);
    transaction.update(boardDoc(), { slots });
    return { start: slots[index].startTitle, goal: slots[index].goalTitle };
  });
}

export function slotLabelDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1, day));
}

export function titlesChanged(slot, start, goal) {
  return !sameTitle(slot.startTitle, normalizeTitle(start))
    || !sameTitle(slot.goalTitle, normalizeTitle(goal));
}
