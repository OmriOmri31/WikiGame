import { test as base, expect } from '@playwright/test';
import { israelDateKey } from './emulator.mjs';
import { DAILY, mockWikipedia } from './wiki-mock.mjs';

// Hosts of the real Firebase project. A test build talks only to the local emulators, so any
// request here is a bug: it is blocked and fails the test.
const PRODUCTION_FIREBASE = /(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebaseremoteconfig|generativelanguage)\.googleapis\.com|wikigame-5ebec|firebaseio\.com/;
const ALLOWED = /^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/;
// Firebase Auth preloads Google's sign-in helper script in Safari/WebKit. It is blocked like the
// rest, but expected, so it does not fail the test.
const EXPECTED_BLOCKED = /^https:\/\/apis\.google\.com\/js\/api\.js/;

export const test = base.extend({
  // Per test: wikiState.overrides[title] = 'fail' | 'stall' | 'missing', changeable mid-test.
  wikiState: async ({}, use) => { await use({ overrides: {}, log: [], pageviews: 'ok' }); },
  skipIntro: [true, { option: true }],
  external: async ({}, use) => { await use([]); },
  consoleErrors: async ({}, use) => { await use([]); },

  page: async ({ page, wikiState, skipIntro, external, consoleErrors }, use) => {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    // Everything not mocked and not local is blocked and recorded.
    await page.route(/.*/, (route) => {
      const url = route.request().url();
      if (ALLOWED.test(url)) return route.fallback();
      if (!EXPECTED_BLOCKED.test(url)) external.push(url);
      return route.abort('blockedbyclient');
    });
    await mockWikipedia(page, wikiState);
    if (skipIntro) {
      const today = israelDateKey();
      await page.addInitScript((day) => {
        try { localStorage.setItem('wikigame.introDay', day); } catch { /* ignore */ }
      }, today);
    }
    await use(page);
    const firebase = external.filter((url) => PRODUCTION_FIREBASE.test(url));
    expect(firebase, 'requests to the real Firebase project').toEqual([]);
    expect(external, 'requests to unmocked outside hosts').toEqual([]);
  },
});

export { expect };

// Home screen, with the daily and free buttons ready.
export async function openHome(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
}

// The game hides article text from the browser's own find-in-page by putting U+E000 between
// letters (findGuard.js). This matches a title with or without those marks.
export function guarded(title, { whole = true } = {}) {
  const body = [...title].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\uE000?');
  return new RegExp(whole ? `^\\s*${body}\\s*$` : body);
}

// Clicks an article link inside the playing article (not the goal sheet).
export function articleLink(page, title) {
  return page.locator('.article-scroll .article-body').getByRole('link', { name: guarded(title) });
}

export async function waitForArticle(page, title) {
  await expect(page.locator('.article-scroll article h1')).toHaveText(guarded(title));
  await expect(page.getByRole('progressbar', { name: 'טוען ערך' })).toHaveCount(0);
}

export async function startDaily(page) {
  await openHome(page);
  await page.getByRole('button', { name: 'משחק יומי' }).click();
  await waitForArticle(page, DAILY.start);
  await expect(page.locator('.route-title')).toHaveText(guarded(DAILY.start));
  await expect(page.getByRole('button', { name: guarded(DAILY.goal) })).toBeVisible();
}

export async function openMenu(page) {
  const button = page.getByRole('button', { name: 'תפריט' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

// The free games list is folded under a disclosure button on the leaderboard.
export async function openFreeBoard(page) {
  const free = page.getByRole('region', { name: 'המשחקים החופשיים שלי' });
  const toggle = free.locator('.board-disclosure');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return free;
}

export const pagesStat = (page) => page.locator('.info-row').first().getByText(/מספר הדפים/);


// The full daily table is folded under "טבלה יומית"; the player's own row shows above it.
export async function openDailyTable(page) {
  const board = page.getByRole('region', { name: 'משחק יומי' });
  const toggle = board.locator('.board-disclosure');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return board;
}
