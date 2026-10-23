import { useEffect, useState } from 'react';

const STEPS = [
  { src: '/tutorial/01.png', line: 'הקישו על התחל.' },
  { src: '/tutorial/02.png', line: 'זה הדף שאתם עליו עכשיו.' },
  { src: '/tutorial/03.png', line: 'לכאן צריך להגיע.' },
  { src: '/tutorial/04.png', line: 'הקישו על קישור כחול כדי לעבור דף.' },
  { src: '/tutorial/05.png', line: 'מספר הדפים עלה, ופחות עדיף, ובשוויון פחות זמן עדיף.' },
  { src: '/tutorial/06.png', line: 'החץ מחזיר דף אחד ומוריד את מספר הדפים, ויש 3 פעמים.' },
  { src: '/tutorial/07.png', line: 'זכוכית המגדלת מוצאת מילה בדף הזה, והיא עובדת רק בדף הראשון שפתחתם אותה בו.' },
  { src: '/tutorial/08.png', line: 'פתיחה מכאן היא רק להסתכל, והקישורים כאן לא נספרים.' },
  { src: '/tutorial/09.png', line: 'מסיימים כשקישור מדף אמיתי מגיע לכאן.' },
];

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7l10 10M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Tutorial({ onClose }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.querySelector('.tutorial');
    const hidden = [...(root?.parentElement?.children || [])].filter((el) => el !== root);
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      document.body.style.overflow = previous;
      hidden.forEach((el) => el.removeAttribute('inert'));
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (last) onClose();
        else setIndex(index + 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex(Math.max(0, index - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, last, onClose]);

  function finish() {
    if (last) onClose();
    else setIndex((current) => current + 1);
  }

  return (
    <div
      className="tutorial"
      role="dialog"
      aria-modal="true"
      aria-label={`שלב ${index + 1} מתוך ${STEPS.length}`}
      aria-describedby="tutorial-line"
    >
      <div className="tutorial-bar">
        <button className="tutorial-close" type="button" aria-label="סגירה" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <figure className="tutorial-figure">
        <img src={step.src} alt="" />
      </figure>
      <p id="tutorial-line" className="tutorial-line">{step.line}</p>
      <div className="tutorial-nav">
        {index > 0 ? (
          <button className="secondary" type="button" onClick={() => setIndex((current) => current - 1)}>
            הקודם
          </button>
        ) : null}
        <button className="primary" type="button" onClick={finish} autoFocus>
          {last ? 'סיום' : 'הבא'}
        </button>
      </div>
    </div>
  );
}
