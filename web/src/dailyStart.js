import { liveDailyPair } from './dailyPair.js';
import { normalizeTitle } from './wikipedia.js';
import { preparedHtml, sharedArticle } from './articleCache.js';

// While the home screen is open, today's daily articles load in the background, so the daily
// game opens at once. Only the pair that is already live today is used (never the next day's
// pair staged in the evening), and nothing is shown: the game still reads the pair itself when it
// starts, and the clock starts then, exactly as before.
export async function prefetchDailyStart({
  readDoc,
  resolveStart,
  now = () => new Date(),
  share = sharedArticle,
  prepare = preparedHtml,
  idle = (task) => setTimeout(task, 0),
  saveData = Boolean(globalThis.navigator?.connection?.saveData),
} = {}) {
  if (saveData) return [];
  const snapshot = await readDoc();
  if (!snapshot?.exists?.()) return [];
  const pair = liveDailyPair(snapshot.data(), now());
  if (!pair.live) return [];
  const goal = normalizeTitle(pair.goal);
  const start = await resolveStart(pair.start, goal);
  if (!start || !goal) return [];
  const titles = [normalizeTitle(start), goal];
  titles.forEach((title) => {
    share(title).then((article) => idle(() => prepare(article))).catch(() => {});
  });
  return titles;
}
