// A tiny, fixed Hebrew Wikipedia for the tests. Every request the app makes to Wikipedia,
// Wikimedia pageviews, Google Fonts and Netlify functions is answered here, so the tests are
// deterministic and never depend on (or load) the real sites.

const link = (title, text = title) => `<a href="/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}" title="${title}">${text}</a>`;

// title -> outgoing article links. The HTML adds a section anchor, an external link and a
// special page, which the game must not follow.
export const GRAPH = {
  'ירושלים': ['ישראל', 'חיפה', 'ערך תקוע'],
  'ישראל': ['תל אביב-יפו', 'ירושלים', 'חיפה'],
  'חיפה': ['ישראל'],
  'תל אביב-יפו': ['ישראל', 'יפו'],
  'יפו': ['תל אביב-יפו'],
  'חתול': ['כלב'],
  'כלב': ['חתול'],
  'ערך תקוע': ['ישראל'],
};

export const DAILY = { start: 'ירושלים', goal: 'תל אביב-יפו' };
export const FREE_POOL = ['חתול', 'כלב'];

export function articleHtml(title) {
  const links = (GRAPH[title] || []).map((name) => `<li>${link(name)}</li>`).join('');
  return `<div class="mw-parser-output">
<p><b>${title}</b> הוא ערך לבדיקות. ראו גם <a href="#קישורים">קישורים</a>,
<a href="https://example.com/outside" class="external">אתר חיצוני</a> ו
<a href="/wiki/%D7%9E%D7%99%D7%95%D7%97%D7%93:%D7%90%D7%A7%D7%A8%D7%90%D7%99" title="מיוחד:אקראי">ערך אקראי</a>.</p>
<p>${'טקסט למילוי. '.repeat(40)}</p>
<h2 id="קישורים">קישורים</h2>
<ul>${links}</ul>
</div>`;
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

function pagesFor(titles, extra) {
  return titles.map((title) => (GRAPH[title] ? { ns: 0, title, ...extra(title) } : { ns: 0, title, missing: true }));
}

// The fastest-route search (wikiBot.js) asks for links, links-here and redirects in batches.
function answerQuery(params) {
  const titles = (params.get('titles') || '').split('|').filter(Boolean);
  const prop = params.get('prop') || '';
  if (prop === 'links') {
    return { query: { pages: pagesFor(titles, (t) => ({ links: GRAPH[t].map((name) => ({ ns: 0, title: name })) })) } };
  }
  if (prop === 'linkshere') {
    return {
      query: {
        pages: pagesFor(titles, (t) => ({
          linkshere: Object.keys(GRAPH).filter((from) => GRAPH[from].includes(t)).map((from) => ({ ns: 0, title: from })),
        })),
      },
    };
  }
  if (prop === 'redirects') return { query: { pages: pagesFor(titles, () => ({})) } };
  return { query: { pages: pagesFor(titles, () => ({})) } };
}

// Per-test overrides: title -> 'fail' (HTTP 503), 'stall' (never answers), 'missing'.
export async function mockWikipedia(page, state = { overrides: {}, log: [] }) {
  const { overrides, log } = state;
  await page.route(/^https:\/\/he\.(m\.)?wikipedia\.org\/w\/api\.php/, async (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    const action = params.get('action');
    if (action === 'parse') {
      const title = (params.get('page') || '').replace(/_/g, ' ');
      log.push(title);
      const mode = overrides[title];
      if (mode === 'stall') return undefined; // never fulfilled: the app's own time limit must kick in
      if (mode === 'fail') return json(route, { error: 'unavailable' }, 503);
      if (mode === 'missing' || !GRAPH[title]) {
        return json(route, { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } });
      }
      const html = articleHtml(title);
      if (params.get('formatversion') === '2') return json(route, { parse: { title, text: html } });
      return json(route, { parse: { title, displaytitle: title, text: { '*': html } } });
    }
    if (action === 'query') return json(route, answerQuery(params));
    return json(route, { error: { code: 'e2e', info: 'not mocked' } });
  });

  // Most-read lists (free game pool, and a daily start of "main page").
  await page.route(/^https:\/\/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews\//, (route) => (state.pageviews === 'fail' ? json(route, {}, 503) : json(route, {
    items: [{ articles: [{ article: 'עמוד_ראשי', rank: 1 }, ...FREE_POOL.map((article, i) => ({ article, rank: i + 2 }))] }],
  })));
  await page.route(/^https:\/\/(upload\.wikimedia\.org|fonts\.gstatic\.com)\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/\/\.netlify\/functions\//, (route) => json(route, { ok: true }));
}
