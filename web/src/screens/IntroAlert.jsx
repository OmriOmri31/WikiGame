import { useEffect } from 'react';

const STORAGE_KEY = 'wikigame.intro';

export function introSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // The alert still closes for this visit.
  }
}

export default function IntroAlert({ open, onDismiss }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
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
        <button className="primary" type="button" autoFocus onClick={onDismiss}>
          הבנתי
        </button>
      </div>
    </div>
  );
}
