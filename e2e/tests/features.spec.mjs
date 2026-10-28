import {
  test, expect, openHome, articleLink, waitForArticle, titled, startFree, openMenu,
} from '../fixtures.mjs';
import { DAILY, EASY_POOL } from '../wiki-mock.mjs';
import { PLAYER } from '../emulator.mjs';

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
    const note = page.locator('.corner-actions').getByRole('status');
    await expect(note).toHaveText('הקישור הועתק');
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toMatch(/^בואו לשחק ב־WikiWiki/);
    expect(copied).toContain('https://wikiwiki-game.netlify.app');
    await expect(note).toHaveText('', { timeout: 5000 });
  });

  test('is an icon in the top corner, not a text button under the results', async ({ page }) => {
    await openHome(page);
    const corner = page.locator('.corner-actions');
    await expect(corner.getByRole('button', { name: 'שתפו את WikiWiki' })).toBeVisible();
    await expect(corner.getByRole('button', { name: 'שתפו את WikiWiki' })).toHaveAttribute('title', 'שתפו את WikiWiki');
    await expect(page.getByText('שתפו את WikiWiki')).toHaveCount(0);
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
    await expect(page.locator('.corner-actions').getByRole('status')).toHaveText('');
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
    expect(await page.evaluate(() => localStorage.getItem('wikigame.hintGames.v2'))).toBe('1');
  });

  test('still shows in the third game', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('wikigame.hintGames.v2', '2'); });
    await openHome(page);
    await startFree(page);
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await expect(page.getByRole('button', { name: 'קרא את ערך היעד' })).toBeVisible();
  });

  test('is gone from the fourth game on', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('wikigame.hintGames.v2', '3'); });
    await openHome(page);
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    await expect(page.getByRole('button', { name: titled(DAILY.goal) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'קרא את ערך היעד' })).toHaveCount(0);
  });
});

test.describe('"קרא את ערך היעד" after the update', () => {
  async function giveUp(page) {
    await openMenu(page);
    await page.getByRole('menuitem', { name: /ויתור/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ויתור' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  }
  const hint = (page) => page.getByRole('button', { name: 'קרא את ערך היעד' });

  test('a player who played before sees it in the next three games, daily and free mixed, then not', async ({ page }) => {
    // Played a lot before this release: the old counter and saved results.
    await page.addInitScript(() => {
      if (localStorage.getItem('wikigame.setupDone')) return;
      localStorage.setItem('wikigame.setupDone', '1');
      localStorage.setItem('wikigame.gamesPlayed', '30');
      const row = (mode, day) => ({
        mode, day, pagesVisited: 4, timeTaken: 60, startTitle: 'חתול', goalTitle: 'כלב',
        path: ['חתול', 'כלב'], createdAt: Date.now() - 86_400_000,
      });
      localStorage.setItem('wikigame.localScores', JSON.stringify([row('free'), row('free'), row('daily', '2026-01-01')]));
    });
    await openHome(page);
    // 1: daily.
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    await expect(page.locator('.coach')).toHaveCount(0);
    await expect(hint(page)).toBeVisible();
    await giveUp(page);
    // 2: free, random.
    await openHome(page);
    await startFree(page);
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await expect(hint(page)).toBeVisible();
    // A reload goes on with the same game: still game 2.
    await page.reload();
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await expect(hint(page)).toBeVisible();
    await giveUp(page);
    // 3: free, easy.
    await openHome(page);
    await startFree(page, 'קל');
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    await expect(hint(page)).toBeVisible();
    await giveUp(page);
    // 4: free again. The hint is gone.
    await openHome(page);
    await startFree(page);
    await expect(page.locator('.route-title')).toHaveText(/\S/);
    // The count is written when the first article is in, at the same moment the hint is decided.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('wikigame.hintGames.v2'))).toBe('4');
    await expect(page.getByRole('progressbar', { name: 'טוען ערך' })).toHaveCount(0);
    await expect(hint(page)).toHaveCount(0);
  });
});

test.describe('help button', () => {
  test('"?" opens the explanation of the game, and it closes again', async ({ page }) => {
    await openHome(page);
    const help = page.locator('.corner-actions').getByRole('button', { name: 'הסבר על המשחק' });
    await expect(help).toHaveAttribute('title', 'הסבר על המשחק');
    await help.click();
    const intro = page.getByRole('alertdialog', { name: 'איך מגיעים מכדורגל לפיל?' });
    await expect(intro).toBeVisible();
    await expect(intro).toContainText('רק בלחיצה על קישורים');
    await intro.getByRole('button', { name: 'הבנתי' }).click();
    await expect(intro).toHaveCount(0);
    await help.click();
    await expect(intro).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toHaveCount(0);
  });

  test('the three corner icons sit in one row, the same size, clear of "איך משחקים?", on a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openHome(page);
    const corner = page.locator('.corner-actions');
    const names = ['מצב (כהה|בהיר)', 'שתפו את WikiWiki', 'הסבר על המשחק'];
    const boxes = [];
    for (const name of names) boxes.push(await corner.getByRole('button', { name: new RegExp(`^${name}$`) }).boundingBox());
    for (const box of boxes) {
      expect(Math.round(box.width)).toBe(44);
      expect(Math.round(box.height)).toBe(44);
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(1);
    }
    // Theme in the corner, then share, then help.
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
    const how = await page.getByRole('button', { name: 'איך משחקים?' }).boundingBox();
    expect(boxes[2].x + boxes[2].width).toBeLessThan(how.x);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('help button, signed in', () => {
  test.use({ skipIntro: false });
  test('a signed-in player gets "don\'t show again" only on the automatic intro, not from "?"', async ({ page }) => {
    const intro = page.getByRole('alertdialog', { name: 'איך מגיעים מכדורגל לפיל?' });
    await page.goto('/');
    await expect(intro).toBeVisible();
    await intro.getByRole('button', { name: 'הבנתי' }).click();
    await expect(intro).toHaveCount(0);
    await page.getByRole('button', { name: 'התחברות או הרשמה עם אימייל' }).click();
    await page.getByLabel('אימייל').fill(PLAYER.email);
    await page.getByLabel('סיסמה').fill(PLAYER.password);
    await page.locator('form').getByRole('button', { name: 'התחברות' }).click();
    await expect(page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` })).toBeVisible({ timeout: 15_000 });

    // A new day for the intro: it opens by itself, with the box.
    await page.evaluate(() => {
      localStorage.removeItem('wikigame.introDay');
      sessionStorage.removeItem('wikigame.introSession');
    });
    await page.reload();
    await expect(intro).toBeVisible();
    await expect(page.getByRole('heading', { name: `שלום, ${PLAYER.nickname}` })).toBeAttached({ timeout: 15_000 });
    await expect(intro.getByRole('checkbox', { name: 'אל תציג שוב' })).toBeVisible();
    await intro.getByRole('button', { name: 'הבנתי' }).click();
    await expect(intro).toHaveCount(0);

    // Opened on purpose from "?": no box.
    await page.locator('.corner-actions').getByRole('button', { name: 'הסבר על המשחק' }).click();
    await expect(intro).toBeVisible();
    await expect(intro.getByRole('checkbox')).toHaveCount(0);
    await expect(intro.getByText('אל תציג שוב')).toHaveCount(0);
    await intro.getByRole('button', { name: 'הבנתי' }).click();
    await expect(intro).toHaveCount(0);
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
