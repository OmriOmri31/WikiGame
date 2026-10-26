// Emails the site owner (NAME_ALERT_TO) when a player signs up with Google and keeps a Google name that contains a blocked
// word (e.g. a real name like "בן זיני"). The app allows such names; this lets the owner review them.
//
// The caller sends its Firebase ID token. Google checks the token (accounts:lookup), and the
// email only goes out when all of these hold:
// - the account signed in with Google;
// - the nickname is exactly the Google account name;
// - that nickname is the one saved in the player's profile (read with the player's own token);
// - it really contains a blocked word.
// So only a real Google account with such a name can trigger it. Resend's idempotency key stops
// repeats of the same uid + nickname for 24 hours.
// Without NAME_ALERT_TO or RESEND_API_KEY it only logs, and it always answers quickly so sign-up never waits.
import { blockedTermsIn } from '../../src/blockedNames.js';
import { cleanNickname, nicknameFormatProblem } from '../../src/nicknameRules.js';

const FIREBASE_KEY = 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ';

// Netlify sets URL to the site's main address (production or test site).
function siteReferer() {
  return `${(process.env.URL || 'https://omri-wiki-game.netlify.app').replace(/\/+$/, '')}/`;
}
const PROJECT_ID = 'wikigame-5ebec';
const ALERT_FROM = 'WikiGame <onboarding@resend.dev>';
const CONSOLE_USERS = `https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

async function lookupAccount(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`, {
    method: 'POST',
    // The site's address as the referrer, so the browser key can be limited to the site's domains.
    headers: { 'content-type': 'application/json', referer: siteReferer() },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const body = await response.json();
  return body.users?.[0] || null;
}

async function savedNickname(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${idToken}` } });
  if (!response.ok) return '';
  const body = await response.json();
  return body.fields?.nickname?.stringValue || '';
}

export function alertEmail({ nickname, uid, email, site, terms, when }) {
  const subject = `WikiGame: כינוי לבדיקה – ${nickname}`;
  const lines = [
    `שחקן נרשם עם Google ושמר את השם מהחשבון שלו, ויש בו מילה מהרשימה החסומה.`,
    `הכינוי אושר. אם צריך, אפשר למחוק את החשבון.`,
    '',
    `כינוי: ${nickname}`,
    `מילים שזוהו: ${terms.join(', ')}`,
    `UID: ${uid}`,
    `אימייל: ${email || '(לא ידוע)'}`,
    `אתר: ${site}`,
    `זמן (שעון ישראל): ${when}`,
    '',
    `מחיקה: פותחים את Firebase Console > Authentication > Users, מחפשים את ה-UID או האימייל ומוחקים את המשתמש:`,
    CONSOLE_USERS,
    `(הכינוי והפרופיל נשארים ב-Firestore תחת nicknames/ ו-users/ – אפשר למחוק גם אותם שם.)`,
  ];
  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.6">${lines
    .map((line) => (line === CONSOLE_USERS ? `<a href="${CONSOLE_USERS}">${CONSOLE_USERS}</a>` : escapeHtml(line)))
    .join('<br>')}</div>`;
  return { subject, text: lines.join('\n'), html };
}

export async function handleNameAlert(request) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) return json({ error: 'forbidden' }, 403);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const nickname = cleanNickname(typeof payload?.nickname === 'string' ? payload.nickname : '');
  if (!nickname || nicknameFormatProblem(nickname)) return json({ error: 'bad request' }, 400);

  const account = await lookupAccount(idToken);
  if (!account?.localId) return json({ error: 'forbidden' }, 403);
  const google = (account.providerUserInfo || []).find((entry) => entry.providerId === 'google.com');
  if (!google) return json({ error: 'not google' }, 403);
  if (cleanNickname(google.displayName || '') !== nickname) return json({ error: 'not the google name' }, 403);
  const terms = blockedTermsIn(nickname);
  if (!terms.length) return json({ sent: false, reason: 'clean' });
  if ((await savedNickname(account.localId, idToken)) !== nickname) return json({ error: 'not saved' }, 409);

  const site = process.env.WIKIGAME_ENV === 'test' ? `test (${process.env.URL || ''})` : `production (${process.env.URL || ''})`;
  const when = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
  const message = alertEmail({ nickname, uid: account.localId, email: account.email || google.email || '', site, terms, when });

  const to = (process.env.NAME_ALERT_TO || '').trim();
  if (!to) {
    console.log('name-alert: NAME_ALERT_TO is not set; not sent', account.localId, terms.join(','));
    return json({ sent: false, reason: 'no recipient' });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('name-alert: RESEND_API_KEY is not set; not sent', account.localId, terms.join(','));
    return json({ sent: false, reason: 'no key' });
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'idempotency-key': `name-alert-${account.localId}-${encodeURIComponent(nickname)}`.slice(0, 256),
      },
      body: JSON.stringify({ from: ALERT_FROM, to: [to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) {
      console.error('name-alert: resend', response.status, (await response.text()).slice(0, 300));
      return json({ sent: false, reason: 'send failed' });
    }
    return json({ sent: true });
  } catch (error) {
    console.error('name-alert', error);
    return json({ sent: false, reason: 'send failed' });
  }
}

export default function handler(request) {
  return handleNameAlert(request);
}
