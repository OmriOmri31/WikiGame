import { ADMIN_UID } from '../../src/admin.js';
import { geminiComplete } from '../../src/geminiDirect.js';

const FIREBASE_KEY = 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ';

// Netlify sets URL to the site's main address (production or test site).
function siteReferer() {
  return `${(process.env.URL || 'https://wikiwiki-game.netlify.app').replace(/\/+$/, '')}/`;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Set only on the test Netlify site. Production has neither variable, so this is always ''.
function testAdminUid() {
  if (process.env.WIKIGAME_ENV !== 'test') return '';
  return process.env.WIKIGAME_TEST_ADMIN_UID || '';
}

async function uidFromToken(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`, {
    method: 'POST',
    // The site's address as the referrer, so the browser key can be limited to the site's domains.
    headers: { 'content-type': 'application/json', referer: siteReferer() },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return '';
  const body = await response.json();
  return body.users?.[0]?.localId || '';
}

export async function handleGemini(request) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken || !ADMIN_UID) return json({ error: 'forbidden' }, 403);
  const uid = await uidFromToken(idToken);
  if (!uid || (uid !== ADMIN_UID && uid !== testAdminUid())) return json({ error: 'forbidden' }, 403);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  const schema = payload.schema && typeof payload.schema === 'object' ? payload.schema : null;
  const maxOutputTokens = Math.max(1, Math.min(200, Number(payload.maxOutputTokens) || 64));
  if (!prompt || !schema) return json({ error: 'bad request' }, 400);

  try {
    const result = await geminiComplete(prompt, schema, maxOutputTokens);
    return json(result, 200);
  } catch (error) {
    console.error(error);
    const status = error.status === 429 || error.status >= 500 ? error.status : 502;
    return json({
      error: String(error.message || 'gemini').slice(0, 180),
      ...(error.cost ? { cost: error.cost } : {}),
    }, status);
  }
}

export default function handler(request) {
  return handleGemini(request);
}
