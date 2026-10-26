import { clickableVias, findShortestPath, WIKI_BOT_MAX_PAGES } from './wikiBot.js';
import { normalizeTitle } from './wikipedia.js';
import { playReasoner } from './reasonerPlay.js';

function failed(errorMessage) {
  return {
    status: 'error',
    pagesVisited: 0,
    timeTaken: 0,
    path: [],
    pathVia: [],
    gaveUp: false,
    calls: 0,
    spentUsd: 0,
    checked: false,
    error: errorMessage,
  };
}

// The search gets three minutes. A good pair takes seconds, so running out of time means something
// went wrong (rate limits, network) and the search is run again.
export const BFS_TIME_LIMIT_MS = 3 * 60 * 1000;
export const BFS_MAX_ATTEMPTS = 3;
export const BFS_TIMEOUT_ERROR = 'החיפוש לא הסתיים תוך 3 דקות';
export const MAX_REDRAWS = 3;

export async function runBfs(start, goal, { timeLimitMs = BFS_TIME_LIMIT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeLimitMs);
  try {
    const found = await findShortestPath(start, goal, { maxPages: WIKI_BOT_MAX_PAGES, signal: controller.signal });
    if (!found) {
      return {
        status: 'gave-up',
        pagesVisited: 0,
        timeTaken: 0,
        path: [],
        pathVia: [],
        gaveUp: true,
        calls: 0,
        spentUsd: 0,
        checked: true,
        error: '',
      };
    }
    return {
      status: 'done',
      pagesVisited: found.pagesVisited,
      timeTaken: found.timeTaken,
      path: found.path,
      pathVia: Array.isArray(found.via) ? found.via : [],
      gaveUp: false,
      calls: 0,
      spentUsd: 0,
      checked: true,
      error: '',
    };
  } catch (error) {
    if (controller.signal.aborted) return { ...failed(BFS_TIMEOUT_ERROR), timedOut: true };
    console.error(error);
    return failed('החיפוש נכשל');
  } finally {
    clearTimeout(timer);
  }
}

function foundRoute(result) {
  return Boolean(result) && result.status !== 'error' && !result.gaveUp;
}

// Both bots on one pair. The search is run up to BFS_MAX_ATTEMPTS times while it fails (time limit,
// errors) or says "no route" although the reasoner found one. noPath is true only when the search
// went through every page it could reach without errors and the reasoner found no route either;
// the caller then draws a new pair. onAttempt(n) reports which attempt is running.
export async function solvePair(start, goal, complete, { bfs: known, reasoner: knownReasoner, onBfs, onReasoner, onAttempt, skipReasoner = false } = {}) {
  const reasonerTask = skipReasoner || (knownReasoner && knownReasoner.status !== 'error')
    ? Promise.resolve(skipReasoner ? null : knownReasoner)
    : runReasoner(start, goal, complete).then(async (result) => {
      await onReasoner?.(result);
      return result;
    });
  let bfs = known && known.status !== 'error' ? known : null;
  let noPath = false;
  if (!bfs) {
    for (let attempt = 1; attempt <= BFS_MAX_ATTEMPTS; attempt += 1) {
      onAttempt?.(attempt);
      bfs = { ...(await runBfs(start, goal)), attempts: attempt };
      if (foundRoute(bfs)) break;
      if (bfs.gaveUp) {
        const reasoner = await reasonerTask;
        if (!foundRoute(reasoner)) {
          noPath = true;
          break;
        }
      }
      if (attempt < BFS_MAX_ATTEMPTS) console.log(`search attempt ${attempt} ${bfs.timedOut ? 'timed out' : bfs.gaveUp ? 'found nothing (reasoner did)' : 'failed'}: ${start} -> ${goal}`);
    }
    await onBfs?.(bfs);
  }
  const reasoner = await reasonerTask;
  return { bfs, reasoner, noPath };
}

const UNLINKED = 'הדרך כוללת קישור שלא מופיע בדף';

export async function confirmBfsResult(result) {
  if (!result || result.checked || result.status === 'error' || result.gaveUp) return result;
  const path = Array.isArray(result.path) ? result.path.map((title) => normalizeTitle(title)) : [];
  if (path.length < 2) return { ...result, path, checked: true };
  if (path.some((title) => !title)) {
    return { ...result, status: 'error', checked: false, error: UNLINKED };
  }
  try {
    const notes = await clickableVias(path);
    if (!notes.ok || notes.via.length !== path.length - 1) {
      return { ...result, status: 'error', checked: false, error: UNLINKED };
    }
    return { ...result, path, pathVia: notes.via, checked: true, error: '' };
  } catch (error) {
    console.error(error);
    return result;
  }
}

export async function runReasoner(start, goal, complete) {
  try {
    const result = await playReasoner({ start, goal, complete });
    return {
      status: result.gaveUp ? 'gave-up' : 'done',
      pagesVisited: result.path.length,
      timeTaken: result.timeTaken,
      path: result.path,
      pathVia: [],
      gaveUp: Boolean(result.gaveUp),
      calls: result.calls,
      spentUsd: result.spentUsd,
      error: '',
    };
  } catch (error) {
    console.error(error);
    return failed('וויקי בוט נכשל');
  }
}

export async function askDeskModel(user, prompt, schema, maxOutputTokens) {
  const token = await user.getIdToken();
  let response;
  try {
    response = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt, schema, maxOutputTokens }),
    });
  } catch (error) {
    console.error(error);
    const failedCall = new Error('שרת וויקי בוט לא זמין');
    failedCall.status = 0;
    throw failedCall;
  }
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = response.status === 404
      ? 'שרת וויקי בוט לא זמין'
      : (body.error || 'וויקי בוט נכשל');
    const failedCall = new Error(message);
    failedCall.status = response.status;
    if (body.cost) failedCall.cost = body.cost;
    throw failedCall;
  }
  return { json: body.json, cost: body.cost || { usd: 0, input: 0, output: 0, thoughts: 0 } };
}
