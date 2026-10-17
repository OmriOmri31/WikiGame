import { useEffect } from 'react';
import Stage from '../Stage';

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onDone, reduced ? 400 : 1800);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <Stage className="stage-splash">
      <main className="splash-copy">
        <p className="kicker">משחק יומי</p>
        <h1>משחק <em>הוויקיפדיה</em></h1>
        <p className="splash-route" dir="rtl">
          <bdi>ערך פתיחה</bdi>
          <span aria-hidden="true">←</span>
          <bdi>קישורים</bdi>
          <span aria-hidden="true">←</span>
          <bdi>מטרה</bdi>
        </p>
      </main>
    </Stage>
  );
}
