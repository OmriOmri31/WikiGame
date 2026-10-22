import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { drawDistinctPair, normalizeTitle, sameTitle } from './wikipedia.js';
import { confirmedArticle } from './wikiBot.js';
import {
  appendPairs,
  boardReady,
  normalizeBoard,
  pairKey,
} from './lotteryModel.js';

const ref = doc(db, 'lotteryQueue', 'board');
let filling = null;

function cloneSlots(slots) {
  return slots.map((slot) => ({ ...slot }));
}

export function subscribeQueue(listener) {
  return onSnapshot(ref, (snap) => {
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

async function fillQueue() {
  for (let pass = 0; pass < 3; pass += 1) {
    const snap = await getDoc(ref);
    const board = normalizeBoard(snap.exists() ? snap.data() : null);
    if (boardReady(board)) return;
    const drawn = await appendPairs(board.slots, (taken) => drawDistinctPair(taken));
    let done = false;
    try {
      done = await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(ref);
      const current = normalizeBoard(fresh.exists() ? fresh.data() : null);
      if (boardReady(current)) return true;
      const merged = await appendPairs(current.slots, async (taken) => {
        const match = drawn.find((slot) => !taken.has(pairKey(slot.startTitle, slot.goalTitle)));
        if (!match) throw new Error('pair');
        taken.add(pairKey(match.startTitle, match.goalTitle));
        return { start: match.startTitle, goal: match.goalTitle };
      });
      transaction.set(ref, {
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
    const snap = await transaction.get(ref);
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
    };
    transaction.update(ref, { slots });
  });
  return { start, goal };
}

export async function saveSlotResult(index, key, startTitle, goalTitle, result) {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const board = normalizeBoard(snap.data());
    const slot = board.slots[index];
    if (!slot) return;
    if (!sameTitle(slot.startTitle, startTitle) || !sameTitle(slot.goalTitle, goalTitle)) return;
    const slots = cloneSlots(board.slots);
    slots[index] = { ...slot, [key]: result };
    transaction.update(ref, { slots });
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
