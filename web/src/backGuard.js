import { useEffect, useRef } from 'react';

// Native back (Android back, browser back, iOS swipe) never leaves the app by surprise.
//
// Two ways to catch it:
// - Android (Chrome and other browsers with CloseWatcher): a close watcher. Android's back goes to
//   it before the page history, and a page may always keep one, even before the player has touched
//   anything. A history entry does not work there: Chrome skips entries a page added without a
//   touch first (its history manipulation intervention), and pushing one while handling a back
//   press counts as no touch, so back left the app from the home screen.
// - Everywhere else: one extra history entry, the guard, on top of the page the app was opened on.
//   A back press lands on the page below it, and App.jsx handles it.
// Either way, back on the home screen or in a game shows a notice, and the next back leaves.

export const EXIT_NOTICE = "לחצו שוב על 'חזור' כדי לצאת מהמשחק";
// How long the notice stays. The guard comes back after it (or at the next touch).
export const EXIT_NOTICE_MS = 3000;

function onAndroid() {
  const nav = window.navigator;
  return nav.userAgentData?.platform === 'Android' || /Android/i.test(nav.userAgent || '');
}

export function closeWatcherBack() {
  return typeof window.CloseWatcher === 'function' && onAndroid();
}

// The guard itself, or an entry the app pushed above it (an info page, the desk).
export function isGuardState(state) {
  return Boolean(state && (state.wikiGuard || state.info || state.desk));
}

export function pushGuard() {
  window.history.pushState({ wikiGuard: true }, '', window.location.href);
}

// Back to the home address, keeping the guard when the current entry is the guard.
export function resetUrl() {
  window.history.replaceState(window.history.state?.wikiGuard ? { wikiGuard: true } : null, '', '/');
}

// Open popups (the intro, the free game chooser, sheets, confirm dialogs), newest last. Back closes
// the newest one instead of leaving the screen.
const popups = [];

export function hasOpenPopup() {
  return popups.length > 0;
}

export function closeTopPopup() {
  const top = popups[popups.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

export function useBackCloses(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const entry = { current: () => closeRef.current() };
    popups.push(entry);
    return () => {
      const at = popups.indexOf(entry);
      if (at >= 0) popups.splice(at, 1);
    };
  }, [open]);
}
