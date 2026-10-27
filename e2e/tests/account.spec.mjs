import { test, expect, openHome, openDailyTable } from '../fixtures.mjs';
import { OTHER, PLAYER } from '../emulator.mjs';

// A verified email account on the Auth emulator, with a nickname and a daily score (see emulator.mjs).
test('a signed-in player sees their scores, play again only on their own row, and signs out', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
  await page.getByLabel('אימייל').fill(PLAYER.email);
  await page.getByLabel('סיסמה').fill(PLAYER.password);
  await page.locator('form').getByRole('button', { name: 'התחברות' }).click();

  await expect(page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` })).toBeVisible({ timeout: 15_000 });
  const mine = page.getByRole('region', { name: 'התוצאה היומית שלי' });
  await expect(mine.locator('.my-score')).toHaveCount(1);
  await expect(mine).toContainText('3 צעדים');

  await page.getByRole('button', { name: 'תוצאות' }).click();
  const board = await openDailyTable(page);
  const own = board.locator('.score-row').filter({ hasText: PLAYER.nickname }).first();
  const other = board.locator('.score-row').filter({ hasText: OTHER.nickname }).first();
  await expect(own).toBeVisible();
  await expect(other).toBeVisible();
  await expect(own.getByRole('button', { name: 'שחק שוב' })).toBeVisible();
  await expect(own.getByRole('button', { name: 'שיתוף' })).toBeVisible();
  await expect(other.getByRole('button', { name: 'שחק שוב' })).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'שיתוף' })).toHaveCount(0);

  await page.getByRole('button', { name: 'חזרה', exact: true }).click();
  await page.getByRole('button', { name: 'התנתקות' }).click();
  await expect(page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' })).toBeVisible();
});

test('a wrong password shows an error and stays signed out', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
  await page.getByLabel('אימייל').fill(PLAYER.email);
  await page.getByLabel('סיסמה').fill('not-the-password');
  await page.locator('form').getByRole('button', { name: 'התחברות' }).click();
  await expect(page.locator('.form-error')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^שלום/ })).toHaveCount(0);
});
