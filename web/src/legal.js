// Contact address shown on the privacy, terms and accessibility pages.
// Set it here (one place). While it is empty the pages say an address will be added soon.
export const CONTACT_EMAIL = 'contact@wikiwikigame.anonaddy.me';

// Shown as "עודכן לאחרונה" on the info pages. Change it when the text changes.
export const LEGAL_UPDATED = '26 באוקטובר 2026';

export const WIKIPEDIA_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.he';
export const WIKIPEDIA_TERMS_URL = 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/he';
export const WIKIPEDIA_HOME_URL = 'https://he.wikipedia.org/';


// The info pages, their addresses and titles. App.jsx opens them with pushState, like the desk.
export const INFO_PAGES = {
  privacy: { path: '/privacy', title: 'מדיניות פרטיות' },
  terms: { path: '/terms', title: 'תנאי שימוש' },
  accessibility: { path: '/accessibility', title: 'הצהרת נגישות' },
  credits: { path: '/credits', title: 'קרדיטים' },
};

export function infoPageFromPath(pathname = window.location.pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return Object.keys(INFO_PAGES).find((key) => INFO_PAGES[key].path === clean) || '';
}
