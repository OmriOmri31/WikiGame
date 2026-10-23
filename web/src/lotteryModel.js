import { addIsraelDays, nextPublishDateKey, normalizeTitle } from './wikipedia.js';

export const LOTTERY_DAYS = 5;

export function pairKey(start, goal) {
  return `${normalizeTitle(start)}\n${normalizeTitle(goal)}`;
}

export function takenPairKeys(slots) {
  const taken = new Set();
  (slots || []).forEach((slot) => {
    if (slot?.startTitle && slot?.goalTitle) taken.add(pairKey(slot.startTitle, slot.goalTitle));
  });
  return taken;
}

function textList(value, keepEmpty = false) {
  if (!Array.isArray(value)) return [];
  const list = value.map((item) => normalizeTitle(item));
  return keepEmpty ? list : list.filter(Boolean);
}

export function normalizeBot(value) {
  if (!value || typeof value !== 'object') return null;
  const status = value.status === 'gave-up' || value.status === 'error' ? value.status : 'done';
  return {
    status,
    pagesVisited: Number(value.pagesVisited) || 0,
    timeTaken: Number(value.timeTaken) || 0,
    path: textList(value.path),
    pathVia: textList(value.pathVia, true),
    checked: value.checked === true,
    gaveUp: Boolean(value.gaveUp),
    calls: Number(value.calls) || 0,
    spentUsd: Number(value.spentUsd) || 0,
    error: typeof value.error === 'string' ? value.error : '',
  };
}

export function blankSlot(dateKey, start, goal) {
  return {
    dateKey,
    startTitle: normalizeTitle(start),
    goalTitle: normalizeTitle(goal),
    bfs: null,
    reasoner: null,
  };
}

export function normalizeSlot(value, index, origin) {
  const slot = value && typeof value === 'object' ? value : {};
  const dateKey = typeof slot.dateKey === 'string' && slot.dateKey
    ? slot.dateKey
    : addIsraelDays(origin, index);
  return {
    dateKey,
    startTitle: normalizeTitle(slot.startTitle),
    goalTitle: normalizeTitle(slot.goalTitle),
    bfs: normalizeBot(slot.bfs),
    reasoner: normalizeBot(slot.reasoner),
  };
}

export function normalizeBoard(data, now = new Date()) {
  const raw = Array.isArray(data?.slots) ? data.slots : [];
  const origin = typeof raw[0]?.dateKey === 'string' && raw[0].dateKey
    ? raw[0].dateKey
    : nextPublishDateKey(now);
  return {
    slots: raw.map((slot, index) => normalizeSlot(slot, index, origin)),
    publishedDateKey: typeof data?.publishedDateKey === 'string' ? data.publishedDateKey : '',
    lastPublished: data?.lastPublished && typeof data.lastPublished === 'object' ? data.lastPublished : null,
  };
}

export function boardReady(board) {
  return board.slots.length >= LOTTERY_DAYS
    && board.slots.every((slot) => slot.startTitle && slot.goalTitle && slot.dateKey);
}

export async function appendPairs(slots, draw, now = new Date()) {
  const next = slots.map((slot) => ({ ...slot }));
  const taken = takenPairKeys(next);
  const origin = next[0]?.dateKey || nextPublishDateKey(now);
  while (next.length < LOTTERY_DAYS) {
    const pair = await draw(taken);
    next.push(blankSlot(addIsraelDays(origin, next.length), pair.start, pair.goal));
  }
  return next;
}

export function shiftBoard(slots, today, drawn) {
  const kept = slots.slice(1).map((slot) => ({ ...slot }));
  kept.push(blankSlot('', drawn.start, drawn.goal));
  const tomorrow = addIsraelDays(today, 1);
  return kept.slice(0, LOTTERY_DAYS).map((slot, index) => ({
    ...slot,
    dateKey: addIsraelDays(tomorrow, index),
  }));
}
