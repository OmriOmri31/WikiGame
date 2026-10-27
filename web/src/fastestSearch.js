import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { updateLocalFastestPath } from './localScores';
import { findShortestPath } from './wikiBot';
import { normalizeTitle } from './wikipedia';

const PENDING_KEY = 'wikigame.fastestPending';
const PATH_KEY = 'wikigame.fastestPaths';
const MISSED_KEY = 'wikigame.fastestMissed';
const PATH_LIMIT = 200;
// The search runs in the player's browser after a free game ends, one request at a time, and
// gives up after this long so it never weighs on the next game or on Wikipedia.
export const SEARCH_TIME_LIMIT_MS = 60000;

const jobs = new Map();
const listeners = new Set();

let pending = [];
let paths = {};
let missed = [];

function pairKey(start, goal) {
  const from = normalizeTitle(start);
  const to = normalizeTitle(goal);
  if (!from || !to) return '';
  return `${from}\n${to}`;
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  const store = storage();
  if (!store) return fallback;
  try {
    const parsed = JSON.parse(store.getItem(key) || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
  }
}

function loadPending() {
  const parsed = readJson(PENDING_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => (
    item
    && typeof item.id === 'string'
    && item.id
    && normalizeTitle(item.start)
    && normalizeTitle(item.goal)
  ));
}

function loadPaths() {
  const parsed = readJson(PATH_KEY, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const next = {};
  Object.entries(parsed).forEach(([id, path]) => {
    if (typeof id !== 'string' || !id || !Array.isArray(path)) return;
    next[id] = path.filter((title) => typeof title === 'string');
  });
  return next;
}

function savePending() {
  writeJson(PENDING_KEY, pending);
}

function loadMissed() {
  const parsed = readJson(MISSED_KEY, []);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : [];
}

// Results whose search ran out of time. Nothing is written to the score, so the row simply says
// the route wasn't found in time instead of showing a wrong "no route".
function rememberMissed(id) {
  if (!id || missed.includes(id)) return;
  missed = [...missed, id].slice(-PATH_LIMIT);
  writeJson(MISSED_KEY, missed);
}

function rememberPath(id, path) {
  const next = { ...paths, [id]: path };
  const ids = Object.keys(next);
  if (ids.length > PATH_LIMIT) {
    ids.slice(0, ids.length - PATH_LIMIT).forEach((old) => {
      delete next[old];
    });
  }
  paths = next;
  writeJson(PATH_KEY, paths);
}

function snapshot() {
  return {
    pendingIds: pending.map((item) => item.id),
    missedIds: missed.slice(),
    paths: { ...paths },
  };
}

function emit() {
  const next = snapshot();
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (error) {
      console.error(error);
    }
  });
}

function writePath(entry, path) {
  const titles = Array.isArray(path) ? path : [];
  rememberPath(entry.id, titles);
  pending = pending.filter((item) => item.id !== entry.id);
  savePending();
  emit();
  const saved = entry.local
    ? Promise.resolve(updateLocalFastestPath(entry.id, titles))
    : updateDoc(doc(db, 'scores', entry.id), { fastestPath: titles });
  saved.catch((error) => {
    console.error(error);
  });
}

function deliver(entry, path) {
  if (!pending.some((item) => item.id === entry.id)) return;
  if (!Array.isArray(path)) {
    pending = pending.filter((item) => item.id !== entry.id);
    savePending();
    rememberMissed(entry.id);
    emit();
    return;
  }
  writePath(entry, path);
}

function watchJob(job, entry) {
  if (!job || !entry?.id) return;
  if (job.status === 'done') {
    deliver(entry, job.path);
    return;
  }
  job.promise.then((path) => deliver(entry, path));
}

export function beginFastestSearch(start, goal) {
  const key = pairKey(start, goal);
  if (!key) return null;
  const existing = jobs.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIME_LIMIT_MS);
  const job = {
    status: 'running',
    path: null,
    controller,
  };
  jobs.set(key, job);
  // A found route is a list of titles, and [] means there is no route within 25 pages.
  // null means the search stopped (time limit, a new game, a network problem): unknown.
  job.promise = findShortestPath(start, goal, { signal: controller.signal })
    .then((found) => (Array.isArray(found?.path) ? found.path : []))
    .catch((error) => {
      if (error?.code !== 'stopped') console.error(error);
      return null;
    })
    .then((path) => {
      clearTimeout(timer);
      job.status = 'done';
      job.path = path;
      // A search that didn't finish can run again for a later game on the same pair.
      if (path === null) {
        jobs.forEach((value, name) => {
          if (value === job) jobs.delete(name);
        });
      }
      return path;
    });
  return job;
}

// Stops every search still running (a new game is starting, or the page is closing).
export function stopFastestSearches() {
  new Set(jobs.values()).forEach((job) => {
    if (job.status === 'running') job.controller?.abort();
  });
}

export function fastestPathNow(start, goal) {
  const job = jobs.get(pairKey(start, goal));
  if (!job || job.status !== 'done') return null;
  return Array.isArray(job.path) ? job.path : [];
}

export function publishFastestPath(start, goal, target) {
  const job = beginFastestSearch(start, goal);
  if (!job || !target?.id) return;
  const entry = {
    id: target.id,
    local: Boolean(target.local),
    start,
    goal,
  };
  pending = pending.filter((item) => item.id !== entry.id).concat([entry]);
  savePending();
  emit();
  watchJob(job, entry);
}

export function subscribeFastestPaths(listener) {
  listener(snapshot());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

pending = loadPending();
missed = loadMissed();
// Searches live only as long as the page. Results still waiting from an earlier visit can't
// finish now, so they show as not found in time rather than searching forever.
if (pending.length) {
  pending.forEach((item) => rememberMissed(item.id));
  pending = [];
  savePending();
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', stopFastestSearches);
paths = loadPaths();
pending.forEach((entry) => {
  watchJob(beginFastestSearch(entry.start, entry.goal), entry);
});
