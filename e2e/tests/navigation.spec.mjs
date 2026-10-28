import {
  test, expect, openHome, openMenu, startDaily, startFree, waitForArticle,
} from '../fixtures.mjs';
import { DAILY } from '../wiki-mock.mjs';
import { PLAYER } from '../emulator.mjs';

// The device's own back (Android back, browser back, iOS swipe) never leaves the app by surprise.
const NOTICE = "לחצו שוב על 'חזור' כדי לצאת מהמשחק";

// On Android the app catches back with a close watcher (Chrome skips history entries a page adds
// before the first touch), so there the device's back is Escape, which reaches close watchers the
// same way. Elsewhere it is the browser's back.
async function deviceBack(page) {
  if (test.info().project.name === 'android') await page.keyboard.press('Escape');
  else await page.goBack();
}

const homeButton = (page) => page.getByRole('button', { name: 'משחק יומי' });

// The first back on the home screen shows the notice and stays; the app is still there.
async function expectHomeNotice(page) {
  await expect(homeButton(page)).toBeVisible();
  await expect(page.getByText(NOTICE)).toHaveCount(0);
  await deviceBack(page);
  await expect(page.getByText(NOTICE)).toBeVisible();
  await expect(homeButton(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
}

test.describe('native back', () => {
  test('home, back: a notice and still in the app; back again: leaves', async ({ page }) => {
    await openHome(page);
    await expectHomeNotice(page);
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('home, right after loading and before any touch: back shows the notice', async ({ page }) => {
    await page.goto('/');
    await deviceBack(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(homeButton(page)).toBeVisible();
  });

  test('after the notice goes away, back shows it again', async ({ page }) => {
    await openHome(page);
    await deviceBack(page);
    const notice = page.getByText(NOTICE);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(0, { timeout: 6_000 });
    await deviceBack(page);
    await expect(notice).toBeVisible();
    await expect(homeButton(page)).toBeVisible();
  });

  test('a touch after the notice guards home again', async ({ page }) => {
    await openHome(page);
    await deviceBack(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await page.locator('h1').first().click();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('scores, back: home; back again: the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'תוצאות' }).click();
    await expect(homeButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'חזרה', exact: true })).toBeVisible();
    await deviceBack(page);
    await expect(homeButton(page)).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('scores, "חזרה": home, and back there shows the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'תוצאות' }).click();
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expectHomeNotice(page);
  });

  test('in a game, back shows the notice and the game stays', async ({ page }) => {
    await startDaily(page);
    await deviceBack(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await waitForArticle(page, DAILY.start);
  });

  test('a daily game given up: home, and back there shows the notice', async ({ page }) => {
    await startDaily(page);
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'חזרה לדף הבית' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'חזרה לדף הבית' }).click();
    await expectHomeNotice(page);
  });

  test('a free game given up, then "משחק חדש" on the scores: home, and back shows the notice', async ({ page }) => {
    await openHome(page);
    await startFree(page);
    await expect(page.locator('.article-scroll article h1')).toBeVisible();
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'חזרה לדף הבית' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'חזרה לדף הבית' }).click();
    await page.getByRole('button', { name: 'משחק חדש' }).click();
    await expectHomeNotice(page);
  });

  test('the free game chooser: back closes it, then back shows the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק חופשי' }).click();
    const chooser = page.getByRole('dialog', { name: 'משחק חופשי' });
    await expect(chooser).toBeVisible();
    await deviceBack(page);
    await expect(chooser).toHaveCount(0);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('in the game menu, back closes the menu and the game stays', async ({ page }) => {
    await startDaily(page);
    await openMenu(page);
    await deviceBack(page);
    await expect(page.getByRole('button', { name: 'תפריט' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await waitForArticle(page, DAILY.start);
  });

  test('in the tutorial, back goes home; back again: the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'איך משחקים?' }).click();
    await expect(homeButton(page)).toHaveCount(0);
    await deviceBack(page);
    await expect(homeButton(page)).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('an info page, back: home; back again: the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('link', { name: 'תנאי השימוש' }).first().click();
    await expect(homeButton(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/terms/);
    await deviceBack(page);
    await expect(homeButton(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('signed in, after reopening the app: back on home shows the notice', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
    await page.getByLabel('אימייל').fill(PLAYER.email);
    await page.getByLabel('סיסמה').fill(PLAYER.password);
    await page.locator('form').getByRole('button', { name: 'התחברות' }).click();
    const hello = page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` });
    await expect(hello).toBeVisible({ timeout: 15_000 });
    await expectHomeNotice(page);
    await page.reload();
    await expect(hello).toBeVisible({ timeout: 15_000 });
    await expectHomeNotice(page);
  });

  test('installed app (standalone): back on home shows the notice', async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query) => (/display-mode:\s*(standalone|fullscreen)/.test(query)
        ? { ...real(query), matches: true, media: query, addEventListener() {}, removeEventListener() {} }
        : real(query));
      Object.defineProperty(window.navigator, 'standalone', { value: true });
    });
    await page.goto('/');
    await expectHomeNotice(page);
  });
});

test.describe('native back with the intro open', () => {
  test.use({ skipIntro: false });

  test('the intro opened by itself: back closes it, then back shows the notice', async ({ page }) => {
    await page.goto('/');
    const intro = page.getByRole('alertdialog');
    await expect(intro).toBeVisible();
    await deviceBack(page);
    await expect(intro).toHaveCount(0);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectHomeNotice(page);
  });

  test('the intro dismissed with "הבנתי": back shows the notice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('alertdialog').getByRole('button', { name: 'הבנתי' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expectHomeNotice(page);
  });
});

test.describe('native back on Android', () => {
  test.skip(() => test.info().project.name !== 'android', 'Android only');

  test('the app catches back with a close watcher, not an extra history entry', async ({ page }) => {
    await openHome(page);
    expect(await page.evaluate(() => typeof window.CloseWatcher)).toBe('function');
    expect(await page.evaluate(() => window.history.state?.wikiGuard ?? null)).toBeNull();
    await expectHomeNotice(page);
  });
});
