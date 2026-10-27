import { test, expect, openHome, waitForArticle } from '../fixtures.mjs';
import { DAILY } from '../wiki-mock.mjs';

// Loading-time budgets on the built app, served locally with Wikipedia mocked, so these measure
// our own code and bundle, not the network. Current timings are in TESTING.md; budgets have headroom.
const BUDGET_MS = { firstPaint: 2500, homeReady: 3000, dailyStart: 3000 };

test.describe('loading times', () => {
  test('the home screen paints and is ready to play within budget', async ({ page }) => {
    const started = Date.now();
    await openHome(page);
    const homeReady = Date.now() - started;
    const firstPaint = await page.evaluate(() =>
      performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
    test.info().annotations.push({ type: 'timing', description: `first paint ${Math.round(firstPaint)} ms, home ready ${homeReady} ms` });
    expect(firstPaint).toBeGreaterThan(0);
    expect(firstPaint).toBeLessThan(BUDGET_MS.firstPaint);
    expect(homeReady).toBeLessThan(BUDGET_MS.homeReady);
  });

  test('the daily game shows its first article within budget', async ({ page }) => {
    await openHome(page);
    const started = Date.now();
    await page.getByRole('button', { name: 'משחק יומי' }).click();
    await waitForArticle(page, DAILY.start);
    const dailyStart = Date.now() - started;
    test.info().annotations.push({ type: 'timing', description: `daily start ${dailyStart} ms` });
    expect(dailyStart).toBeLessThan(BUDGET_MS.dailyStart);
  });
});
