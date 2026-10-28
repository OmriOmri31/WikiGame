// Native back (Android back, browser back, iOS swipe) never leaves the app by surprise.
// The app keeps one extra history entry, the guard, on top of the page it was opened on. A back
// press lands on the page below it, which App.jsx turns into an in-app step back, or, on the home
// screen and in a game, a notice. The next back then leaves the site as usual.

export const EXIT_NOTICE = "לחצו שוב על 'חזור' כדי לצאת מהמשחק";
// How long the notice stays. The guard comes back after it (or at the next touch).
export const EXIT_NOTICE_MS = 3000;

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
