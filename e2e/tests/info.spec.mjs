import { test, expect, openHome } from '../fixtures.mjs';

const PAGES = [
  ['פרטיות', 'מדיניות פרטיות', '/privacy'],
  ['תנאי שימוש', 'תנאי שימוש', '/terms'],
  ['נגישות', 'הצהרת נגישות', '/accessibility'],
  ['קרדיטים', 'קרדיטים', '/credits'],
];

test.describe('info pages', () => {
  for (const [label, title, path] of PAGES) {
    test(`${path} opens from the footer and goes back`, async ({ page }) => {
      await openHome(page);
      await page.getByRole('navigation', { name: 'מידע על האתר' }).getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page).toHaveTitle(`${title} – משחק הוויקיפדיה`);
      await page.getByRole('button', { name: 'חזרה', exact: true }).click();
      await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });

    test(`${path} opens straight from its address`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    });
  }

  test('report link is a mail link to the public contact alias', async ({ page }) => {
    await openHome(page);
    const report = page.getByRole('link', { name: 'דיווח על בעיה' });
    await expect(report).toHaveAttribute('href', /^mailto:contact@wikiwikigame\.anonaddy\.me\?subject=/);
    const href = await report.getAttribute('href');
    expect(decodeURIComponent(href.split('subject=')[1])).toBe('דיווח על בעיה ב־WikiWiki');
  });

  test('browser back from an info page returns home', async ({ page }) => {
    await openHome(page);
    await page.getByRole('link', { name: 'תנאי שימוש', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'תנאי שימוש' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
  });
});
