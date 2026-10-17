const STORAGE_KEY = 'wiki-theme';

export function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function savedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    /* Storage can be blocked. */
  }
  return '';
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
}

export function applyInitialTheme() {
  applyTheme(savedTheme() || systemTheme());
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* The choice still applies for this visit. */
  }
  applyTheme(next);
  window.dispatchEvent(new CustomEvent('wiki-theme', { detail: next }));
  return next;
}
