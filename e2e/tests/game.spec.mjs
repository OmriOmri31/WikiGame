import {
  test, expect, openHome, articleLink, waitForArticle, guarded, startDaily, openMenu, openFreeBoard, pagesStat,
} from '../fixtures.mjs';
import { DAILY, FREE_POOL } from '../wiki-mock.mjs';

test.describe('daily game (guest, no sign-in)', () => {
  test('play through links to the goal, see the end screen and the board', async ({ page }) => {
    await startDaily(page);
    await expect(pagesStat(page)).toContainText('1');
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
    await expect(pagesStat(page)).toContainText('2');
    await articleLink(page, DAILY.goal).click();

    const end = page.getByRole('dialog', { name: 'סיום המשחק' });
    await expect(end).toBeVisible();
    await expect(end.getByRole('heading', { name: 'כל הכבוד!' })).toBeVisible();
    await expect(end).toContainText('מספר הדפים: 3');

    // The end screen moves on to the leaderboard by itself.
    await expect(page.getByRole('heading', { name: 'משחק יומי', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('התוצאה נשמרה במכשיר הזה.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'התחברות או הרשמה' })).toBeVisible();
  });

  test('back button returns to the previous page and counts down', async ({ page }) => {
    await startDaily(page);
    const back = page.getByRole('button', { name: /^חזרה לדף הקודם/ });
    await expect(back).toBeDisabled();
    await articleLink(page, 'חיפה').click();
    await waitForArticle(page, 'חיפה');
    await expect(back).toHaveAccessibleName('חזרה לדף הקודם, נותרו 3');
    await back.click();
    await waitForArticle(page, DAILY.start);
    await expect(back).toBeDisabled();
  });

  test('hash, outside and special links stay on the page', async ({ page }) => {
    await startDaily(page);
    await page.locator('.article-scroll .article-body').getByRole('link', { name: guarded('אתר חיצוני') }).click();
    await expect(page.getByRole('status')).toHaveText('אפשר לנווט רק בין ערכי ויקיפדיה.');
    await page.locator('.article-scroll .article-body').getByRole('link', { name: guarded('ערך אקראי') }).click();
    await waitForArticle(page, DAILY.start);
    await page.locator('.article-scroll .article-body').getByRole('link', { name: guarded('קישורים') }).click();
    await waitForArticle(page, DAILY.start);
    await expect(pagesStat(page)).toContainText('1');
  });

  test('goal sheet opens, its links are read-only, and closes', async ({ page }) => {
    await startDaily(page);
    await page.getByRole('button', { name: guarded(DAILY.goal) }).click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeVisible();
    await page.getByRole('button', { name: 'חזור למהלך המשחק' }).click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeHidden();
  });

  test('find in page highlights matches', async ({ page }) => {
    await startDaily(page);
    await page.getByRole('button', { name: 'חיפוש בדף', exact: true }).click();
    await page.getByRole('searchbox').or(page.getByRole('textbox', { name: 'חיפוש בדף' })).first().fill('ישראל');
    await expect(page.locator('.find-count, [aria-live]').filter({ hasText: /\d/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'סגירת החיפוש' }).click();
  });

  test('menu: theme, restart and give up', async ({ page }) => {
    await startDaily(page);
    await articleLink(page, 'חיפה').click();
    await waitForArticle(page, 'חיפה');
    await openMenu(page);
    await page.getByRole('menuitem', { name: /התחלה מחדש/ }).click();
    await waitForArticle(page, DAILY.start);
    await expect(pagesStat(page)).toContainText('1');

    await openMenu(page);
    const before = await page.locator('html').getAttribute('data-theme');
    await page.getByRole('menuitem', { name: /מצב (כהה|בהיר)/ }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', before);

    await openMenu(page);
    await page.getByRole('menuitem', { name: /ויתור/ }).click();
    const confirm = page.getByRole('alertdialog', { name: 'לוותר על המשחק?' });
    await confirm.getByRole('button', { name: 'המשך לשחק' }).click();
    await expect(confirm).toHaveCount(0);
    await openMenu(page);
    await page.getByRole('menuitem', { name: /ויתור/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ויתור' }).click();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
  });

  test('a reload resumes the game where it stopped', async ({ page }) => {
    await startDaily(page);
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
    await page.reload();
    await waitForArticle(page, 'ישראל');
    await expect(pagesStat(page)).toContainText('2');
  });
});

test.describe('free game', () => {
  test('starts a pair from the most-read list, wins, finds the fastest route and plays again', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק חופשי' }).click();
    const start = page.locator('.route-title');
    await expect(start).toHaveText(/\S/);
    const startTitle = (await start.textContent()).replace(/\uE000/g, '').trim();
    expect(FREE_POOL).toContain(startTitle);
    const goal = FREE_POOL.find((title) => title !== startTitle);
    await waitForArticle(page, startTitle);
    await articleLink(page, goal).click();
    await expect(page.getByRole('dialog', { name: 'סיום המשחק' })).toBeVisible();

    const free = page.getByRole('region', { name: 'המשחקים החופשיים שלי' });
    await expect(free).toBeVisible({ timeout: 10_000 });
    // The fastest-route search runs after the game, against the mocked Wikipedia.
    await openFreeBoard(page);
    await expect(free.getByRole('button', { name: 'הדרך המהירה ביותר' })).toBeVisible({ timeout: 20_000 });
    await free.getByRole('button', { name: 'הדרך המהירה ביותר' }).click();
    await expect(page.getByRole('dialog', { name: 'הדרך המהירה ביותר' })).toContainText(goal);
    await page.getByRole('button', { name: 'סגור' }).click();

    await free.getByRole('button', { name: 'שחק שוב' }).click();
    await waitForArticle(page, startTitle);
    await expect(page.getByRole('button', { name: guarded(goal) })).toBeVisible();
  });

  test('give up saves the game to the free board', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק חופשי' }).click();
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await openMenu(page);
    await page.getByRole('menuitem', { name: /ויתור/ }).click();
    await expect(page.getByText(/המשחק נשמר בטבלה/)).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ויתור' }).click();
    const free = await openFreeBoard(page);
    await expect(free.getByRole('button', { name: 'שחק שוב' })).toBeVisible();
    // A game given up has nothing to share.
    await expect(free.getByRole('button', { name: 'שיתוף' })).toHaveCount(0);
  });
});
