import { test, expect, openHome, startDaily } from '../fixtures.mjs';
import { PLAYER } from '../emulator.mjs';

// This e2e build is a production build (no WIKIGAME_ENV=test), so it shows what players get.
test.describe('production guards', () => {
  test('five quick taps on the game header do not open the secret code prompt', async ({ page }) => {
    await startDaily(page);
    // On the test site, five taps on the header text (not its buttons) open the prompt.
    const title = page.locator('.game-header .route-title');
    for (let i = 0; i < 5; i += 1) await title.click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog', { name: 'קוד סודי' })).toHaveCount(0);
    await expect(page.getByLabel('הזן קוד סודי:')).toHaveCount(0);
  });

  test('a signed-in player who is not the owner cannot open the desk, at /admin or a desk-shaped address', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
    await page.getByLabel('אימייל').fill(PLAYER.email);
    await page.getByLabel('סיסמה').fill(PLAYER.password);
    await page.locator('form').getByRole('button', { name: 'התחברות' }).click();
    await expect(page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` })).toBeVisible({ timeout: 15_000 });

    for (const path of ['/admin', '/m-ci-fake-desk-path-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'ניהול המשחק' })).toHaveCount(0);
      await expect(page).toHaveTitle('משחק הוויקיפדיה');
    }
  });

  test('the page is served with the netlify.toml security headers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("script-src 'self' 'sha256-");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
