import { test, expect, openHome } from '../fixtures.mjs';

test.describe('home screen', () => {
  test('loads in Hebrew, right to left, with every main button', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('משחק הוויקיפדיה');
    for (const name of ['משחק יומי', 'משחק חופשי', 'תוצאות', 'איך משחקים?',
      'התחברות או הרשמה עם Google', 'התחברות או הרשמה עם אימייל']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText('תוכן מוויקיפדיה העברית, ברישיון CC BY-SA 4.0')).toBeVisible();
    // Production-only build: no test-site marks and no desk button for a guest.
    await expect(page.getByRole('button', { name: 'ניהול המשחק' })).toHaveCount(0);
  });

  test('no console errors and no horizontal scroll on load', async ({ page, consoleErrors }) => {
    await openHome(page);
    await page.waitForTimeout(1500); // Firestore keeps a connection open, so there is no network idle.
    expect(consoleErrors).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('theme toggle switches light and dark and remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openHome(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'מצב כהה' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    // The inline script in index.html applies the saved theme before the first paint.
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'מצב בהיר' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('dark system theme is applied before the app renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('how to play walks through the tutorial', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'איך משחקים?' }).click();
    const tutorial = page.getByRole('dialog', { name: /שלב 1 מתוך/ });
    await expect(tutorial).toBeVisible();
    await page.getByRole('button', { name: 'הבא' }).click();
    await expect(page.getByRole('dialog', { name: /שלב 2 מתוך/ })).toBeVisible();
    await page.getByRole('button', { name: 'הקודם' }).click();
    await expect(page.getByRole('dialog', { name: /שלב 1 מתוך/ })).toBeVisible();
    await page.getByRole('button', { name: 'סגירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('email sign-in form opens, switches tabs and goes back', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
    await expect(page.getByLabel('אימייל')).toBeVisible();
    await page.getByRole('tab', { name: 'חשבון חדש' }).click();
    await expect(page.getByLabel('כינוי')).toBeVisible();
    await page.getByRole('button', { name: 'כבר יש לי חשבון' }).click();
    await page.getByRole('button', { name: 'שכחתי סיסמה' }).click();
    await expect(page.getByRole('heading', { name: 'איפוס סיסמה' })).toBeVisible();
    await page.getByRole('button', { name: 'חזרה להתחברות' }).click();
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' })).toBeVisible();
  });
});

test.describe('first visit', () => {
  test.use({ skipIntro: false });
  test('shows the intro once and closes it', async ({ page }) => {
    await page.goto('/');
    const intro = page.getByRole('alertdialog', { name: 'איך מגיעים מכדורגל לפיל?' });
    await expect(intro).toBeVisible();
    await page.getByRole('button', { name: 'הבנתי' }).click();
    await expect(intro).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
    await expect(intro).toHaveCount(0);
  });
});
