import { test, expect, openHome, articleLink, startDaily, waitForArticle, openDailyTable } from '../fixtures.mjs';
import { OTHER, PLAYER } from '../emulator.mjs';
import { DAILY } from '../wiki-mock.mjs';

function row(page, name) {
  return page.getByRole('region', { name: 'משחק יומי' }).locator('.score-row').filter({ hasText: name });
}

async function finishDaily(page) {
  await startDaily(page);
  await articleLink(page, 'ישראל').click();
  await waitForArticle(page, 'ישראל');
  await articleLink(page, DAILY.goal).click();
  await expect(page.getByRole('dialog', { name: 'סיום המשחק' })).toBeVisible();
  await expect(page.getByText('התוצאה נשמרה במכשיר הזה.')).toBeVisible({ timeout: 10_000 });
}

test.describe('leaderboard', () => {
  test('shows today\'s scores from Firebase, without play again or share on other players', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'תוצאות' }).click();
    await expect(page.getByText('עדיין אין לך תוצאה בטבלה.')).toBeVisible();
    const fastest = page.getByRole('complementary', { name: 'הדרך המהירה של אתמול' });
    await expect(fastest).toContainText('חיפה');
    await fastest.getByRole('button', { name: 'הצג דרך' }).click();
    await expect(page.getByRole('dialog', { name: 'הדרך המהירה ביותר' })).toContainText('ישראל');
    await page.getByRole('button', { name: 'סגור' }).click();
    await openDailyTable(page);
    await expect(row(page, OTHER.nickname)).toBeVisible();
    await expect(row(page, PLAYER.nickname)).toBeVisible();
    await expect(page.getByText('הדירוג לפי מספר הצעדים, ואחר כך לפי הזמן.')).toBeVisible();
    for (const name of [OTHER.nickname, PLAYER.nickname]) {
      await expect(row(page, name).getByRole('button', { name: 'שחק שוב' })).toHaveCount(0);
      await expect(row(page, name).getByRole('button', { name: 'שיתוף' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
  });

  test('the guest\'s own daily result has play again and share (copy)', async ({ page, browserName }) => {
    // No share sheet here, so sharing copies the text.
    await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
    await finishDaily(page);
    const mine = page.locator('.score-row').filter({ has: page.getByRole('button', { name: 'שחק שוב' }) });
    await expect(mine).toHaveCount(1);
    await openDailyTable(page);
    await expect(row(page, OTHER.nickname)).toBeVisible();
    await expect(row(page, OTHER.nickname).getByRole('button', { name: 'שחק שוב' })).toHaveCount(0);
    await expect(mine).toHaveCount(1);

    const share = mine.getByRole('button', { name: 'שיתוף' });
    await share.click();
    await expect(mine.getByRole('button', { name: 'הועתק' })).toBeVisible();
    if (browserName === 'chromium') {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toContain('המשחק היומי ב־WikiWiki');
      expect(text).toContain('הגעתי ליעד ב־3 דפים');
      expect(text).toContain('https://wikiwiki-game.netlify.app');
      // The daily share never gives away the pair.
      expect(text).not.toContain(DAILY.start);
      expect(text).not.toContain(DAILY.goal);
    }
    await expect(mine.getByRole('button', { name: 'שיתוף' })).toBeVisible({ timeout: 4_000 });

    await mine.getByRole('button', { name: 'שחק שוב' }).click();
    await waitForArticle(page, DAILY.start);
  });

  test('share uses the phone share sheet when there is one', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { value: async (data) => { window.__shared.push(data); } });
    });
    await finishDaily(page);
    const mine = page.locator('.score-row').filter({ has: page.getByRole('button', { name: 'שחק שוב' }) });
    await mine.getByRole('button', { name: 'שיתוף' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const shared = await page.evaluate(() => window.__shared[0].text);
    expect(shared).toContain('הגעתי ליעד ב־3 דפים');
  });

  test('the path of the player\'s own result opens', async ({ page }) => {
    await finishDaily(page);
    const mine = page.locator('.score-row').filter({ has: page.getByRole('button', { name: 'שחק שוב' }) });
    await mine.getByRole('button', { name: 'הצג דרך' }).click();
    const dialog = page.getByRole('dialog', { name: 'הדרך' });
    await expect(dialog).toContainText('ישראל');
    await page.getByRole('button', { name: 'סגור' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
