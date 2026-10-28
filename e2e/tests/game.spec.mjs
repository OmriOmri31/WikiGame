import {
  test, expect, openHome, articleLink, waitForArticle, titled, startDaily, openMenu, openFreeBoard, pagesStat, startFree,
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
    await page.locator('.article-scroll .article-body').getByRole('link', { name: titled('אתר חיצוני') }).click();
    await expect(page.getByRole('status')).toHaveText('אפשר לנווט רק בין ערכי ויקיפדיה.');
    await page.locator('.article-scroll .article-body').getByRole('link', { name: titled('ערך אקראי') }).click();
    await waitForArticle(page, DAILY.start);
    await page.locator('.article-scroll .article-body').getByRole('link', { name: titled('קישורים') }).click();
    await waitForArticle(page, DAILY.start);
    await expect(pagesStat(page)).toContainText('1');
  });

  test('goal sheet opens, its links are read-only, and closes', async ({ page }) => {
    await startDaily(page);
    await page.getByRole('button', { name: titled(DAILY.goal) }).click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeVisible();
    await page.getByRole('button', { name: 'חזור למהלך המשחק' }).click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeHidden();
  });

  test('find in page works on every page and never changes the article text', async ({ page }) => {
    await startDaily(page);
    const body = page.locator('.article-scroll .article-body');
    const before = await body.innerHTML();
    const search = page.getByRole('button', { name: 'חיפוש בדף', exact: true });
    const box = page.locator('#page-find-input');
    const count = page.locator('.find-count');

    await search.click();
    await box.fill('טקסט');
    await expect(count).toHaveText('1/40');
    await page.getByRole('button', { name: 'ההתאמה הבאה' }).click();
    await expect(count).toHaveText('2/40');
    // Matches are painted over the text (CSS highlights, or one box outside the article), so the
    // article itself is exactly what Wikipedia sent: no <mark> wrappers, no hidden characters.
    expect(await body.innerHTML()).toBe(before);
    await expect(page.locator('.article-scroll mark')).toHaveCount(0);
    expect(await body.evaluate((node) => node.textContent.includes('\uE000'))).toBe(false);
    await page.getByRole('button', { name: 'סגירת החיפוש' }).click();
    await expect(box).toBeHidden();

    // A new page: the find bar starts closed, and search is still available, as often as needed.
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
    await expect(search).toBeEnabled();
    await search.click();
    await box.fill('למילוי');
    await expect(count).toHaveText('1/40');
    await articleLink(page, 'חיפה').click();
    await waitForArticle(page, 'חיפה');
    await expect(box).toBeHidden();
    await search.click();
    await box.fill('ישראל');
    await expect(count).toHaveText('1/1');
    await page.getByRole('button', { name: 'סגירת החיפוש' }).click();
  });

  test('find in page on a browser without CSS highlights (older iPhones) marks the match from outside the article', async ({ page }) => {
    await page.addInitScript(() => { delete window.Highlight; });
    await startDaily(page);
    const body = page.locator('.article-scroll .article-body');
    const before = await body.innerHTML();
    await page.getByRole('button', { name: 'חיפוש בדף', exact: true }).click();
    await page.locator('#page-find-input').fill('טקסט');
    await expect(page.locator('.find-count')).toHaveText('1/40');
    const spot = page.locator('.article-scroll > .find-spot');
    await expect(spot).toHaveCount(1);
    const first = await spot.boundingBox();
    expect(first.width).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'ההתאמה הבאה' }).click();
    await expect(page.locator('.find-count')).toHaveText('2/40');
    await expect.poll(async () => JSON.stringify(await spot.boundingBox())).not.toBe(JSON.stringify(first));
    expect(await body.innerHTML()).toBe(before);
    await page.getByRole('button', { name: 'סגירת החיפוש' }).click();
    await expect(spot).toHaveCount(0);
  });

  test('articles end without the Wikipedia line; the credits keep the license', async ({ page }) => {
    await startDaily(page);
    const article = page.locator('.article-scroll article');
    await expect(article.getByText('הערך בוויקיפדיה')).toHaveCount(0);
    await expect(article.getByText('CC BY-SA 4.0')).toHaveCount(0);
    await expect(page.locator('.wiki-attribution')).toHaveCount(0);
    await page.getByRole('button', { name: titled(DAILY.goal) }).click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeVisible();
    await expect(page.getByText('הערך בוויקיפדיה')).toHaveCount(0);

    await page.goto('/credits');
    await expect(page.getByRole('link', { name: 'ויקיפדיה העברית' }).first()).toHaveAttribute('href', 'https://he.wikipedia.org/');
    await expect(page.getByRole('link', { name: 'CC BY-SA 4.0' }).first()).toHaveAttribute('href', /creativecommons\.org\/licenses\/by-sa\/4\.0/);
  });

  test('the home screen loads today\'s articles in the background, once, without starting the game', async ({ page, wikiState }) => {
    await openHome(page);
    // Both daily articles are requested while the player is still on the home screen...
    await expect.poll(() => wikiState.log.slice().sort()).toEqual([DAILY.start, DAILY.goal].sort());
    // ...but nothing is shown or started: no article, no clock, no saved game.
    await expect(page.locator('.article-scroll')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('wikigame.session'))).toBeNull();

    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    // The game reused those requests instead of asking Wikipedia again.
    expect(wikiState.log.filter((title) => title === DAILY.start)).toHaveLength(1);
    expect(wikiState.log.filter((title) => title === DAILY.goal)).toHaveLength(1);
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
    await startFree(page);
    const start = page.locator('.route-title');
    await expect(start).toHaveText(/\S/);
    const startTitle = (await start.textContent()).trim();
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
    await expect(page.getByRole('button', { name: titled(goal) })).toBeVisible();
  });

  test('give up saves the game to the free board', async ({ page }) => {
    await openHome(page);
    await startFree(page);
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
