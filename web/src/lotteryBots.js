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

export async function runBfs(start, goal) {
  try {
    const found = await findShortestPath(start, goal, { maxPages: WIKI_BOT_MAX_PAGES });
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
    console.error(error);
    return failed('החיפוש נכשל');
  }
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
