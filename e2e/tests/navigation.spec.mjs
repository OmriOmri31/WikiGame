import { test, expect, openHome, startDaily, waitForArticle } from '../fixtures.mjs';
import { DAILY } from '../wiki-mock.mjs';

// The device's own back (Android back, browser back, iOS swipe) never leaves the app by surprise.
const NOTICE = "לחצו שוב על 'חזור' כדי לצאת מהמשחק";

test.describe('native back', () => {
  test('scores, back: home', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'תוצאות' }).click();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'חזרה', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    // Home is guarded again: the next back shows the notice instead of leaving.
    await page.goBack();
    await expect(page.getByText(NOTICE)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('home, back: a notice and still in the app; back again: leaves', async ({ page }) => {
    await openHome(page);
    await page.goBack();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('after the notice goes away, back shows it again', async ({ page }) => {
    await openHome(page);
    await page.goBack();
    const notice = page.getByText(NOTICE);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(0, { timeout: 6_000 });
    await page.goBack();
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
  });

  test('in a game, back shows the notice and the game stays', async ({ page }) => {
    await startDaily(page);
    await page.goBack();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await waitForArticle(page, DAILY.start);
  });

  test('in the tutorial, back goes home', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'איך משחקים?' }).click();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  });
});
