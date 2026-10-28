import {
  test, expect, openHome, articleLink, waitForArticle, titled, startFree,
} from '../fixtures.mjs';
import { DAILY, EASY_POOL } from '../wiki-mock.mjs';

const coachLine = (page) => page.locator('.coach .coach-text');

test.describe('share the app', () => {
  test('copies the invitation where there is no share sheet, and says so', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copied = '';
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copied = text; } },
      });
    });
    await openHome(page);
    await page.getByRole('button', { name: 'שתפו את WikiWiki' }).click();
    await expect(page.getByRole('button', { name: 'הקישור הועתק' })).toBeVisible();
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toMatch(/^בואו לשחק ב־WikiWiki/);
    expect(copied).toContain('https://wikiwiki-game.netlify.app');
    await expect(page.getByRole('button', { name: 'שתפו את WikiWiki' })).toBeVisible({ timeout: 5000 });
  });

  test('opens the share sheet on phones', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = null;
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { window.__shared = data; } });
    });
    await openHome(page);
    await page.getByRole('button', { name: 'שתפו את WikiWiki' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared?.text || '')).toContain('https://wikiwiki-game.netlify.app');
    // No "copied" note after a real share.
    await expect(page.getByRole('button', { name: 'שתפו את WikiWiki' })).toBeVisible();
  });
});

test.describe('"קרא את ערך היעד"', () => {
  test('shows in a first game, opens the goal, and stays after a reload', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    const hint = page.getByRole('button', { name: 'קרא את ערך היעד' });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(page.getByText('זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.')).toBeVisible();
    await page.getByRole('button', { name: 'חזור למהלך המשחק' }).click();
    await page.reload();
    await waitForArticle(page, DAILY.start);
    await expect(hint).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('wikigame.gamesPlayed'))).toBe('1');
  });

  test('still shows in the third game', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('wikigame.gamesPlayed', '2'); });
    await openHome(page);
    await startFree(page);
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await expect(page.getByRole('button', { name: 'קרא את ערך היעד' })).toBeVisible();
  });

  test('is gone from the fourth game on', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('wikigame.gamesPlayed', '3'); });
    await openHome(page);
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    await expect(page.getByRole('button', { name: titled(DAILY.goal) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'קרא את ערך היעד' })).toHaveCount(0);
  });
});

test.describe('free game kinds', () => {
  test('the chooser offers three kinds and can be closed', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק חופשי' }).click();
    const chooser = page.getByRole('dialog', { name: 'משחק חופשי' });
    for (const name of [/^אקראי/, /^קל/, /^בחירה שלי/]) {
      await expect(chooser.getByRole('button', { name })).toBeVisible();
    }
    await chooser.getByRole('button', { name: 'ביטול' }).click();
    await expect(chooser).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
  });

  test('easy draws both articles from the easy pool and saves the kind', async ({ page }) => {
    await openHome(page);
    await startFree(page, 'קל');
    const start = page.locator('.route-title');
    await expect(start).toHaveText(/\S/);
    const startTitle = (await start.textContent()).trim();
    expect(EASY_POOL).toContain(startTitle);
    const goal = EASY_POOL.find((title) => title !== startTitle);
    await expect(page.getByRole('button', { name: titled(goal) })).toBeVisible();
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('wikigame.session') || 'null'));
    expect(session).toMatchObject({ mode: 'free', freeKind: 'easy' });
  });

  test('choose your own: suggestions, checks, then the game on that pair', async ({ page }) => {
    await openHome(page);
    await startFree(page, 'בחירה שלי');
    const dialog = page.getByRole('dialog', { name: 'בחירה שלי' });
    const startBox = dialog.getByRole('combobox', { name: 'מתחילים בערך' });
    const goalBox = dialog.getByRole('combobox', { name: 'ומגיעים לערך' });
    const play = dialog.getByRole('button', { name: 'מתחילים לשחק' });

    await play.click();
    await expect(dialog.getByRole('alert')).toHaveText('בחרו ערך פתיחה.');

    await startBox.fill('חתו');
    await dialog.getByRole('option', { name: /^חתול/ }).click();
    await expect(startBox).toHaveValue('חתול');

    await goalBox.fill('חתולים');
    await play.click();
    await expect(dialog.getByRole('alert')).toContainText('אותו ערך');

    await goalBox.fill('מרקורי');
    await play.click();
    await expect(dialog.getByRole('alert')).toHaveText('זה דף פירושונים. בחרו ערך מדויק יותר.');

    await goalBox.fill('אין ערך כזה בכלל');
    await play.click();
    await expect(dialog.getByRole('alert')).toHaveText('אין ערך בשם הזה בוויקיפדיה.');

    await startBox.fill('ערך בודד');
    await goalBox.fill('כלב');
    // The only suggestion is what was typed, so the list closes and leaves the button free.
    await expect(goalBox).toHaveAttribute('aria-expanded', 'false');
    await play.click();
    await expect(dialog.getByRole('alert')).toContainText('אין קישורים');

    await startBox.fill('חתולים');
    await play.click();
    await waitForArticle(page, 'חתול');
    await expect(page.getByRole('button', { name: titled('כלב') })).toBeVisible();
    await articleLink(page, 'כלב').click();
    await expect(page.getByRole('dialog', { name: 'סיום המשחק' })).toBeVisible();
    const free = page.getByRole('region', { name: 'המשחקים החופשיים שלי' });
    await expect(free).toBeVisible({ timeout: 10_000 });
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('wikigame.localScores') || '[]'));
    expect(rows[0]).toMatchObject({ mode: 'free', freeKind: 'custom', startTitle: 'חתול', goalTitle: 'כלב' });
  });
});

test.describe('tutorial', () => {
  test.use({ skipTutorial: false });

  test('opens before the first game, plays a whole short game, then starts the daily game', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, 'פיצה');
    await expect(page.locator('.coach')).toBeVisible();
    await expect(page.getByRole('button', { name: 'יציאה מההדרכה' })).toBeVisible();
    await expect(coachLine(page)).toContainText('כאן מתחילים');
    // While a step asks for "הבא", the lit element itself can't be pressed.
    await page.getByRole('button', { name: 'הבא' }).click();
    await expect(coachLine(page)).toContainText('ערך היעד');
    await page.getByRole('button', { name: 'הבא' }).click();

    await page.getByRole('button', { name: 'קרא את ערך היעד' }).click();
    await expect(coachLine(page)).toContainText('חוזרים למשחק');
    await page.getByRole('button', { name: 'חזור למהלך המשחק' }).click();

    await expect(coachLine(page)).toContainText('גבינה');
    await articleLink(page, 'גבינה').click();
    await waitForArticle(page, 'גבינה');
    await expect(coachLine(page)).toContainText('החץ');
    await page.locator('.back-button').click();
    await waitForArticle(page, 'פיצה');

    await page.getByRole('button', { name: 'חיפוש בדף' }).first().click();
    await expect(coachLine(page)).toContainText('כתבו');
    await page.locator('.find-input').fill('איטליה');
    await expect(coachLine(page)).toContainText('מצאנו');
    await articleLink(page, 'איטליה').click();
    await waitForArticle(page, 'איטליה');
    await articleLink(page, 'רומא').click();

    const done = page.getByRole('dialog', { name: 'סיום ההדרכה' });
    await expect(done).toBeVisible();
    await expect(coachLine(page)).toContainText('הגעתם');
    // Nothing was saved: no result, no game to come back to, and the tutorial is not a game.
    const saved = await page.evaluate(() => ({
      scores: localStorage.getItem('wikigame.localScores'),
      session: localStorage.getItem('wikigame.session'),
      games: localStorage.getItem('wikigame.gamesPlayed'),
      seen: localStorage.getItem('wikigame.tutorialSeen'),
    }));
    expect(saved).toEqual({ scores: null, session: null, games: null, seen: '1' });

    await done.getByRole('button', { name: 'למשחק' }).click();
    await waitForArticle(page, DAILY.start);
    await expect(page.locator('.coach')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'קרא את ערך היעד' })).toBeVisible();
  });

  test('X leaves at any step and the free game goes on; it is not forced again', async ({ page }) => {
    await openHome(page);
    await startFree(page);
    await waitForArticle(page, 'פיצה');
    await page.getByRole('button', { name: 'הבא' }).click();
    await page.getByRole('button', { name: 'יציאה מההדרכה' }).click();
    await expect(page.locator('.coach')).toHaveCount(0);
    await expect(page.locator('.route-title')).not.toHaveText('פיצה');
    await expect(page.locator('.article-scroll article h1')).toHaveText(/חתול|כלב/);
    expect(await page.evaluate(() => localStorage.getItem('wikigame.tutorialSeen'))).toBe('1');
  });

  test('"איך משחקים?" opens it again and X goes back home', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('wikigame.tutorialSeen', '1'); });
    await openHome(page);
    await page.getByRole('button', { name: 'איך משחקים?' }).click();
    await waitForArticle(page, 'פיצה');
    await expect(page.locator('.coach')).toBeVisible();
    // Grey everywhere but the lit element: a tap on the article does nothing.
    await page.mouse.click(5, 400);
    await expect(coachLine(page)).toContainText('כאן מתחילים');
    await page.getByRole('button', { name: 'יציאה מההדרכה' }).click();
    await expect(page.getByRole('button', { name: 'משחק יומי' })).toBeVisible();
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
  });
});
