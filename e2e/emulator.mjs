// Seeds the local Firebase emulators (never the real project): today's daily pair, two scores
// and one verified email account with a nickname.
export const PROJECT = 'demo-wikiwiki';
const FIRESTORE = 'http://127.0.0.1:8085';
const AUTH = 'http://127.0.0.1:9099';
const OWNER = { Authorization: 'Bearer owner', 'content-type': 'application/json' };

export const PLAYER = { email: 'player@example.com', password: 'e2e-password-123', nickname: 'בודקת' };
export const OTHER = { uid: 'other-player', nickname: 'שחקן אחר' };

export function israelDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function value(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
}
function fields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, value(v)]));
}

async function call(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method || 'GET'} ${url}: ${response.status} ${await response.text()}`);
  return response.json().catch(() => ({}));
}

export async function setDoc(path, data) {
  await call(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: fields(data) }),
  });
}

export async function seed({ start, goal }) {
  await call(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await call(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

  const today = israelDateKey();
  const now = new Date();
  await setDoc('daily/articles', {
    startArticleTitle: start, targetArticleTitle: goal, timestamp: now, lotteryDateKey: today,
  });

  const account = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=e2e`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: PLAYER.email, password: PLAYER.password, displayName: PLAYER.nickname, returnSecureToken: true }),
  });
  const uid = account.localId;
  await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  await setDoc(`users/${uid}`, { nickname: PLAYER.nickname, createdAt: now });
  await setDoc(`nicknames/${PLAYER.nickname.toLowerCase()}`, { uid, nickname: PLAYER.nickname });

  const score = (who, name, pages, seconds) => ({
    uid: who, name, pagesVisited: pages, timeTaken: seconds, timestamp: now, mode: 'daily', dayKey: today,
    startTitle: start, goalTitle: goal, path: [start, 'ישראל', goal].slice(0, pages),
  });
  await setDoc(`scores/daily_${OTHER.uid}_${today}`, score(OTHER.uid, OTHER.nickname, 3, 41.5));
  await setDoc(`scores/daily_${uid}_${today}`, score(uid, PLAYER.nickname, 3, 62.25));
  // Yesterday's fastest route, shown in its own box on the board.
  const yesterdayAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await setDoc('scores/wiki-bot-yesterday', {
    uid: 'wiki-bot', name: 'הדרך המהירה ביותר', pagesVisited: 2, timeTaken: 0, timestamp: yesterdayAt,
    mode: 'daily', dayKey: israelDateKey(yesterdayAt), startTitle: 'חיפה', goalTitle: 'ישראל', path: ['חיפה', 'ישראל'],
  });
  return { uid, today };
}
