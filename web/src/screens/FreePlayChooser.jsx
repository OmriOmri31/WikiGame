import { lazy, Suspense, useEffect, useState } from 'react';

const CustomPairForm = lazy(() => import('./CustomPairForm'));

const KINDS = [
  { kind: 'random', title: 'אקראי', line: 'שני ערכים אקראיים מוויקיפדיה. לפעמים מפתיע, לפעמים קשה.' },
  { kind: 'easy', title: 'קל', line: 'ערכים מוכרים: מדינות, ערים, סרטים, מפורסמים ועוד.' },
  { kind: 'custom', title: 'בחירה שלי', line: 'בוחרים בעצמכם מאיפה מתחילים ולאן מגיעים.' },
];

// "משחק חופשי": the player picks what kind of free game to play.
export default function FreePlayChooser({ onPlay, onClose }) {
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card confirm-card free-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="free-chooser-title">{custom ? 'בחירה שלי' : 'משחק חופשי'}</h2>
        {custom ? (
          <Suspense fallback={<p className="status">טוען…</p>}>
            <CustomPairForm
              onPlay={(pair) => onPlay('custom', pair)}
              onBack={() => setCustom(false)}
            />
          </Suspense>
        ) : (
          <>
            <p className="lede">איזה משחק בא לכם?</p>
            <div className="free-kinds">
              {KINDS.map(({ kind, title, line }) => (
                <button
                  key={kind}
                  className="free-kind"
                  type="button"
                  data-kind={kind}
                  onClick={() => (kind === 'custom' ? setCustom(true) : onPlay(kind, null))}
                >
                  <span className="free-kind-title">{title}</span>
                  <span className="free-kind-line">{line}</span>
                </button>
              ))}
            </div>
            <button className="text-button free-cancel" type="button" onClick={onClose}>ביטול</button>
          </>
        )}
      </div>
    </div>
  );
}
