const STORAGE_KEY = 'wikigame.localScores';
const MAX_SCORES = 200;

function isRow(value) {
  return Boolean(value)
    && typeof value === 'object'
    && typeof value.id === 'string'
    && (value.mode === 'free' || value.mode === 'daily');
}

export function loadLocalScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRow);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export function saveLocalScore(score) {
  const id = `local-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const row = {
    id,
    local: true,
    uid: '',
    name: score.name || 'שחקן',
    pagesVisited: score.pagesVisited,
    timeTaken: score.timeTaken,
    timestamp: { seconds: Math.floor(Date.now() / 1000) },
    mode: score.mode === 'free' ? 'free' : 'daily',
    startTitle: score.startTitle || '',
    goalTitle: score.goalTitle || '',
    path: Array.isArray(score.path) ? score.path : [],
  };
  const next = [row, ...loadLocalScores()].slice(0, MAX_SCORES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return row;
}
