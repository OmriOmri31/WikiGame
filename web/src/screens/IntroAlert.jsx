import { useEffect, useState } from 'react';
import { israelDateKey } from '../wikipedia.js';

const STORAGE_KEY = 'wikigame.introHide';
// The Israel date (Asia/Jerusalem, like the daily game) on which the intro was last shown.
const DAY_KEY = 'wikigame.introDay';
const SESSION_KEY = 'wikigame.introSession';

let decided = false;
let shouldShow = false;

function read(storage, key) {
  try {
    return storage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the in-memory decision still covers this page.
  }
}

function shownToday(today) {
  if (read(localStorage, DAY_KEY) === today) return true;
  // Same tab, same day (also covers tabs that still hold the older '1' marker).
  const session = read(sessionStorage, SESSION_KEY);
  return session === today || session === '1';
}

// Opening a saved game or the admin desk doesn't show the intro, and doesn't use up today's showing.
export function skipIntroThisSession() {
  decided = true;
  shouldShow = false;
}

// Shown once per Israel day: the first time the app opens that day. Never when hidden for good.
export function claimIntroThisSession(hiddenForever) {
  if (!decided) {
    decided = true;
    const today = israelDateKey(new Date());
    if (hiddenForever || shownToday(today)) shouldShow = false;
    else {
      shouldShow = true;
      write(localStorage, DAY_KEY, today);
      write(sessionStorage, SESSION_KEY, today);
    }
  }
  return shouldShow;
}

export function introSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // The alert still closes for this visit.
  }
}

export default function IntroAlert({ open, rememberable, onDismiss }) {
  const [hideForever, setHideForever] = useState(false);

  useEffect(() => {
    if (open) setHideForever(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss(rememberable && hideForever);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss, rememberable, hideForever]);

  if (!open) return null;

  function close() {
    onDismiss(rememberable && hideForever);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <div
        className="modal-card confirm-card intro-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        aria-describedby="intro-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="intro-title">איך מגיעים מכדורגל לפיל?</h2>
        <div id="intro-body">
          <p>רק בלחיצה על קישורים. כל יום בחצות עולה זוג ערכים חדש מוויקיפדיה, אותו זוג לכולם.</p>
          <p>פחות דפים, מקום גבוה יותר בטבלה. בשוויון, הזמן קובע.</p>
          <p>במשחק החופשי בוחרים: זוג אקראי, זוג קל, או ערכים שבוחרים בעצמכם.</p>
        </div>
        {rememberable ? (
          <label className="intro-remember">
            <input
              type="checkbox"
              checked={hideForever}
              onChange={(event) => setHideForever(event.target.checked)}
            />
            <span>אל תציג שוב</span>
          </label>
        ) : null}
        <button className="primary" type="button" autoFocus onClick={close}>
          הבנתי
        </button>
      </div>
    </div>
  );
}
