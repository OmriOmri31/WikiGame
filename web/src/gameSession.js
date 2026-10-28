const STORAGE_KEY = 'wikigame.session';
const MAX_ACTIVE_MS = 48 * 60 * 60 * 1000;

function isTitle(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
}

export function loadGameSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.mode !== 'daily' && parsed.mode !== 'free') return null;
    if (!isTitle(parsed.startTitle) || !isTitle(parsed.goalTitle) || !isTitle(parsed.currentTitle)) {
      return null;
    }
    if (!Array.isArray(parsed.path) || parsed.path.length < 1 || parsed.path.length > 500) return null;
    if (!parsed.path.every(isTitle)) return null;
    const backUses = Number(parsed.backUses);
    const elapsedMs = Number(parsed.elapsedMs);
    if (!Number.isInteger(backUses) || backUses < 0 || backUses > 3) return null;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ACTIVE_MS) return null;
    const scrollTop = Number(parsed.scrollTop);
    return {
      mode: parsed.mode,
      startTitle: parsed.startTitle,
      goalTitle: parsed.goalTitle,
      currentTitle: parsed.currentTitle,
      path: parsed.path.slice(),
      backUses,
      elapsedMs,
      scrollTop: Number.isFinite(scrollTop) && scrollTop > 0 ? Math.min(scrollTop, 5000000) : 0,
      goalOpen: parsed.goalOpen === true,
      ...(parsed.mode === 'free' && ['random', 'easy', 'custom'].includes(parsed.freeKind)
        ? { freeKind: parsed.freeKind }
        : {}),
      ...(typeof parsed.dailyKey === 'string' && /^\d{4}-\d{2}-\d{2}$|^$/.test(parsed.dailyKey)
        ? { dailyKey: parsed.dailyKey }
        : {}),
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function saveGameSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...session }));
  } catch (error) {
    console.error(error);
  }
}

export function clearGameSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error(error);
  }
}
