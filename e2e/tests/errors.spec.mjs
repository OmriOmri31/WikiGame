import { test, expect, openHome, articleLink, waitForArticle, startDaily, pagesStat } from '../fixtures.mjs';
import { DAILY } from '../wiki-mock.mjs';

const RETRY = 'לא הצלחנו לטעון את הערך. אפשר לנסות שוב.';

test.describe('when Wikipedia fails', () => {
  test('a failed article shows the retry message and links keep working', async ({ page, wikiState }) => {
    wikiState.overrides['ערך תקוע'] = 'fail';
    await startDaily(page);
    await articleLink(page, 'ערך תקוע').click();
    await expect(page.locator('.toast')).toHaveText(RETRY, { timeout: 15_000 });
    await expect(page.getByRole('progressbar', { name: 'טוען ערך' })).toHaveCount(0);
    await expect(pagesStat(page)).toContainText('1');
    // Not frozen: the next link loads.
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
    await expect(pagesStat(page)).toContainText('2');
    // The failed one was retried once.
    expect(wikiState.log.filter((title) => title === 'ערך תקוע')).toHaveLength(2);
  });

  test('a stalled article times out, says so, and links keep working', async ({ page, wikiState }) => {
    wikiState.overrides['ערך תקוע'] = 'stall';
    await page.clock.install();
    await startDaily(page);
    await articleLink(page, 'ערך תקוע').click();
    await expect(page.locator('.toast')).toHaveText('טוען את הערך…');
    // Each try may take 10s and there is one retry. Jump the clock instead of waiting.
    await page.clock.fastForward('00:11');
    await page.clock.fastForward('00:02');
    await page.clock.fastForward('00:11');
    await expect(page.locator('.toast')).toHaveText(RETRY);
    await expect(page.getByRole('progressbar', { name: 'טוען ערך' })).toHaveCount(0);
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
  });

  test('a missing article says it was not found', async ({ page, wikiState }) => {
    wikiState.overrides['ערך תקוע'] = 'missing';
    await startDaily(page);
    await articleLink(page, 'ערך תקוע').click();
    await expect(page.locator('.toast')).toHaveText('הערך לא נמצא.');
    await articleLink(page, 'ישראל').click();
    await waitForArticle(page, 'ישראל');
  });

  test('the daily game cannot load, then loads with "try again"', async ({ page, wikiState }) => {
    wikiState.overrides[DAILY.start] = 'fail';
    await openHome(page);
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await expect(page.getByRole('alert')).toHaveText('לא ניתן לטעון את המאמרים היומיים.', { timeout: 15_000 });
    delete wikiState.overrides[DAILY.start];
    await page.getByRole('button', { name: 'נסו שוב' }).click();
    await waitForArticle(page, DAILY.start);
  });

  test('the free game cannot load without the most-read list, then loads', async ({ page, wikiState }) => {
    wikiState.pageviews = 'fail';
    await openHome(page);
    await page.getByRole('button', { name: 'משחק חופשי' }).click();
    await expect(page.getByRole('alert')).toHaveText('לא ניתן לטעון משחק חופשי.', { timeout: 15_000 });
    wikiState.pageviews = 'ok';
    await page.getByRole('button', { name: 'נסו שוב' }).click();
    await expect(page.locator('.article-scroll article h1')).toBeVisible();
  });
});
