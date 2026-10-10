import { useEffect } from 'react';

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onDone, reduced ? 400 : 1800);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <main className="splash">
      <h1>משחק הוויקיפדיה</h1>
    </main>
  );
}
