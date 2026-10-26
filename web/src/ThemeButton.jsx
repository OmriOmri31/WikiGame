import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, savedTheme, toggleTheme } from './theme';

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const onChoice = (event) => setTheme(event.detail === 'dark' ? 'dark' : 'light');
    window.addEventListener('wiki-theme', onChoice);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (savedTheme()) return;
      const next = media.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', onSystem);

    return () => {
      window.removeEventListener('wiki-theme', onChoice);
      media.removeEventListener('change', onSystem);
    };
  }, []);

  return theme;
}

export function SunIcon() {
  return (
    <svg className="sun-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ThemeButton({ className = '' }) {
  const theme = useTheme();
  const toLight = theme === 'dark';

  return (
    <button
      className={className ? `sun-button ${className}` : 'sun-button'}
      type="button"
      aria-pressed={theme === 'light'}
      aria-label={toLight ? 'מצב בהיר' : 'מצב כהה'}
      onClick={toggleTheme}
    >
      <SunIcon />
    </button>
  );
}

export function themeLabel(theme) {
  return theme === 'dark' ? 'מצב בהיר' : 'מצב כהה';
}
