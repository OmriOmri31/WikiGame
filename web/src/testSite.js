/* global __WIKIGAME_TEST__, __WIKIGAME_TEST_ADMIN__, __WIKIGAME_TEST_DESK__ */
// True only in builds made with WIKIGAME_ENV=test (the test Netlify site). Vite replaces the
// constant at build time, so test-only branches are dropped from production bundles.
export const TEST_SITE = __WIKIGAME_TEST__;

// A second desk account that exists only on the test site (WIKIGAME_TEST_ADMIN_UID on that site).
// It works on its own copy of the queue (lotteryQueue_test), never on the real one.
export const TEST_ADMIN_UID = __WIKIGAME_TEST__ ? __WIKIGAME_TEST_ADMIN__ : '';

export function isTestAdmin(user) {
  return Boolean(TEST_ADMIN_UID) && user?.uid === TEST_ADMIN_UID;
}

// An unlisted copy of the desk on the test site, for any signed-in account. Its address is a long
// secret (WIKIGAME_TEST_DESK_PATH on the test site) that is never in the repo or a production build.
// It works only on lotteryQueue_test, and the reasoner is off there.
const TEST_DESK_PATH = __WIKIGAME_TEST__ && /^m-[A-Za-z0-9_-]{40,}$/.test(__WIKIGAME_TEST_DESK__)
  ? `/${__WIKIGAME_TEST_DESK__}`
  : '';

export function onTestDeskPage() {
  return Boolean(TEST_DESK_PATH) && window.location.pathname === TEST_DESK_PATH;
}

export function pageTitle(title) {
  return __WIKIGAME_TEST__ ? `TEST · ${title}` : title;
}
