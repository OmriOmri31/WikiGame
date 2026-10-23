import { useEffect, useState } from 'react';

const STORAGE_KEY = 'wikigame.introHide';

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
        <h2 id="intro-title">איך משחקים</h2>
        <div id="intro-body">
          <p>כל יום כולם מקבלים אותו זוג ערכים מוויקיפדיה.</p>
          <p>מתחילים בערך אחד, ומגיעים לשני רק דרך קישורים.</p>
          <p>בלי חיפוש. פחות דפים ופחות זמן, גבוה יותר בטבלה.</p>
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
