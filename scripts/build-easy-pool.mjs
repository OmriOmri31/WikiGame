// Builds web/public/easy-pool.json, the article pool of the "easy" free game.
//
//   node scripts/build-easy-pool.mjs            (Node 20+, needs the internet; about 5 minutes)
//
// How the pool is chosen:
// 1. Popular in Israel: every article that made Hebrew Wikipedia's monthly top 1,000 (Wikimedia
//    pageviews API) in the last 36 months.
// 2. Known for a long time, not a news spike: a person must make the top list in at least 6 of
//    those months, or have an article in 60+ Wikipedia languages; places and companies in at least
//    6 months or 150+ languages; animals, plants and elements in at least 3 months or 90+
//    languages; anything else in at least 2 months or 40+ languages.
// 3. Only kinds of things that make a friendly game, read from Wikidata: people from entertainment,
//    sport, the arts and science (no politicians, soldiers, journalists or anyone convicted),
//    countries and cities, films and TV shows, books, songs and bands, sports teams and sports,
//    animals and the elements, companies and websites everyone uses, holidays.
//    Wars, attacks, military units, operations, parties, lists, dates, seasons, diseases and the
//    like never get in, and BLOCKED below removes the few that slip through.
// 4. Real, playable articles: in the main namespace, not a redirect, not a disambiguation page,
//    and at least 6,000 bytes long (so it has plenty of links in and out). A last pass asks
//    Wikipedia about every chosen title once more without following redirects.
//
// The file is static: the game never calls these APIs for the easy pool. Run this again now and
// then to refresh it, and look over the diff before committing.
import { writeFileSync } from 'node:fs';

const OUT = new URL('../web/public/easy-pool.json', import.meta.url);
const MONTHS = 36;
const HEADERS = { 'User-Agent': 'WikiWiki game easy-pool builder (https://github.com/OmriOmri31/WikiGame)' };

// Wikidata "instance of" (P31) values, grouped.
const KINDS = {
  place: ['Q6256', 'Q3624078', 'Q515', 'Q1549591', 'Q108178728', 'Q51929311', 'Q5119', 'Q200250', 'Q1637706',
    'Q112099', 'Q23442', 'Q35657', 'Q5107', 'Q133442', 'Q1200957', 'Q839954', 'Q2264924', 'Q15661340', 'Q8502',
    'Q4022', 'Q165', 'Q23397', 'Q9430', 'Q570116', 'Q33506', 'Q12280'],
  screen: ['Q5398426', 'Q11424', 'Q202866', 'Q15416', 'Q24856', 'Q117467246', 'Q1259759', 'Q581714', 'Q7889', 'Q1107'],
  culture: ['Q7725634', 'Q215380', 'Q571', 'Q8261', 'Q1004', 'Q58483083', 'Q15773347', 'Q1114461', 'Q15632617',
    'Q15711870', 'Q15773317', 'Q22988604', 'Q482994', 'Q134556', 'Q105543609'],
  nature: ['Q16521', 'Q634', 'Q523', 'Q11344', 'Q7377'],
  sport: ['Q476028', 'Q13393265', 'Q31629', 'Q2312410', 'Q349', 'Q135408445'],
  brands: ['Q4830453', 'Q891723', 'Q6881511', 'Q35127', 'Q620615', 'Q3220391', 'Q118140435', 'Q6576792', 'Q431289', 'Q166142'],
  holiday: ['Q1445650', 'Q1197685', 'Q94920', 'Q375011'],
};
const KIND_OF = new Map(Object.entries(KINDS).flatMap(([kind, ids]) => ids.map((id) => [id, kind])));
// Never in the pool, even next to an allowed type: lists, disambiguation, wars, battles, military
// units and operations, attacks, massacres, murders, kidnappings, weapons, parties, elections,
// sports seasons, diseases, disputed or occupied territories and similar.
const BLOCKED_TYPES = new Set(['Q13406463', 'Q4167410', 'Q645883', 'Q2223653', 'Q3199915', 'Q178561', 'Q132821',
  'Q198', 'Q7278', 'Q176799', 'Q104907539', 'Q17127659', 'Q750215', 'Q217327', 'Q3882219', 'Q318296', 'Q459409',
  'Q2380335', 'Q2001676', 'Q124078422', 'Q18487055', 'Q15142894', 'Q42314054', 'Q27020041', 'Q3464665',
  'Q110288240', 'Q24659965', 'Q12761956', 'Q1190554', 'Q15239622', 'Q2577883', 'Q17149090', 'Q772547', 'Q245016',
  'Q695850', 'Q112193867', 'Q929833', 'Q42303753', 'Q112965645']);
// People: at least one of these occupations (P106)...
const PEOPLE_JOBS = new Set(['Q33999', 'Q177220', 'Q10800557', 'Q2259451', 'Q10798782', 'Q36180', 'Q937857', 'Q947873',
  'Q639669', 'Q36834', 'Q4610556', 'Q2526255', 'Q753110', 'Q488205', 'Q245068', 'Q49757', 'Q3665646', 'Q5716684',
  'Q18545066', 'Q4964182', 'Q55960555', 'Q2252262', 'Q855091', 'Q486748', 'Q4853732', 'Q1028181', 'Q3501317',
  'Q3357567', 'Q214917', 'Q170790', 'Q169470', 'Q901', 'Q593644', 'Q1622272', 'Q82594', 'Q3499072', 'Q6665249',
  'Q10833314', 'Q2066131', 'Q11513337', 'Q11338576', 'Q205375', 'Q60723829', 'Q102277154', 'Q17125263', 'Q483501',
  'Q1281618', 'Q6625963', 'Q482980', 'Q28389', 'Q3282637', 'Q2405480', 'Q11481802', 'Q183945', 'Q2490358',
  'Q1414443', 'Q948329', 'Q970153', 'Q131524', 'Q43845', 'Q212980', 'Q39631', 'Q81096', 'Q188094', 'Q201788',
  'Q11631', 'Q13219637', 'Q11774891', 'Q10871364']);
// ...and none of these: politicians, statespeople, diplomats, officers and soldiers, spies, police,
// judges, monarchs and nobles, activists, rabbis, journalists and news people.
const BLOCKED_JOBS = new Set(['Q82955', 'Q189290', 'Q47064', 'Q4991371', 'Q1402561', 'Q9352089', 'Q384593', 'Q372436',
  'Q11499147', 'Q38239859', 'Q19934710', 'Q1250916', 'Q17221', 'Q83307', 'Q30185', 'Q193391', 'Q294414',
  'Q15253558', 'Q16533', 'Q116', 'Q2478141', 'Q133485', 'Q2308372', 'Q1930187', 'Q6051619', 'Q270389', 'Q42909',
  'Q1086863', 'Q17351648']);
// Titles with war, violence or sex words, dates, years and lists.
const BLOCKED_WORDS = /(מלחמ|טבח|פיגוע|רצח|מבצע |טרור|השואה|הפצצ|חטיפ|חטופ|אונס|סקס|מין |פורנ|התאבד|נאצי|היטלר|ג'יהאד|קטל|מתקפ|שחיטה)/;
const NOT_CONTENT = /^\d|^(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\b|^רשימ|^מדינות לפי|\((עונה|פרק)/;
// Hand-picked removals: people tied to war, crime, abuse or politics; adult sites; arms makers;
// places known mostly from the fighting.
const BLOCKED = new Set([
  'אוסאמה בן לאדן', 'יוזף מנגלה', 'אווה בראון', 'שון קומבס', 'אנדרו טייט', 'קווין ספייסי', 'סטיב ויטקוף',
  'מרים אדלסון', 'שלדון אדלסון', 'מלאניה טראמפ', 'איוונה טראמפ', 'בנציון נתניהו', 'עדו נתניהו', 'חנה סנש',
  'ירון זליכה', 'אוסקר שינדלר', 'ענאן ח\'לאילי', 'רופרט מרדוק', 'וודי אלן', 'פאבל דורוב',
  'אונליפאנס', 'רפאל מערכות לחימה מתקדמות', 'אלביט מערכות', 'אינסל', 'פולימרקט',
  'עזה', 'רפיח', 'טולכרם', 'ג\'נין', 'ליטני', 'מדינה פלסטינית', 'דייגו גרסיה', 'על השחיטה',  'XXX (סדרת סרטים)', 'The Bibi Files', 'אין ארץ אחרת', 'שחר אדום (2024)', 'גבעה 338', 'דודו פארוק', 'חרבו דרבו', 'נבחרת פלסטין בכדורגל',
]);
const LIMITS = { person: [6, 60], strict: [6, 150], nature: [3, 90], other: [2, 40] };
const MIN_LENGTH = 6000;

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });
async function getJson(url) {
  for (let tryNo = 0; tryNo < 6; tryNo += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (response.ok) return await response.json();
    } catch {
      // Network hiccup: wait and try again.
    }
    await sleep(3000 * (tryNo + 1));
  }
  throw new Error(`failed: ${url}`);
}
const wikiApi = (params) => getJson(`https://he.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`);
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// 1. Monthly top lists.
const now = new Date();
const monthKeys = [];
const views = new Map(); // raw title -> { months, views }
for (let back = 1; back <= MONTHS; back += 1) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  const year = day.getUTCFullYear();
  const month = String(day.getUTCMonth() + 1).padStart(2, '0');
  const data = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/he.wikipedia.org/all-access/${year}/${month}/all-days`);
  monthKeys.push(`${year}-${month}`);
  for (const row of data.items?.[0]?.articles || []) {
    const title = String(row.article).replace(/_/g, ' ');
    if (title.includes(':')) continue;
    const entry = views.get(title) || { months: 0, views: 0 };
    entry.months += 1;
    entry.views += row.views;
    views.set(title, entry);
  }
}
console.log(`${monthKeys.length} months, ${views.size} articles`);

// 2. Where each title leads (redirects) and what its page is.
const redirectTo = new Map();
const pages = new Map();
for (const batch of chunks([...views.keys()], 50)) {
  const data = await wikiApi({ action: 'query', redirects: '1', prop: 'pageprops|info', ppprop: 'disambiguation|wikibase_item', titles: batch.join('|') });
  for (const row of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) redirectTo.set(row.from, row.to);
  for (const page of data.query?.pages || []) pages.set(page.title, page);
}
const resolve = (title) => {
  let current = title;
  for (let hop = 0; hop < 4 && redirectTo.has(current); hop += 1) current = redirectTo.get(current);
  return current;
};
const stats = new Map(); // resolved title -> { months, views }
for (const [title, entry] of views) {
  const target = resolve(title);
  const merged = stats.get(target) || { months: 0, views: 0 };
  merged.months = Math.max(merged.months, entry.months);
  merged.views += entry.views;
  stats.set(target, merged);
}

// 3. Wikidata types, occupations and language counts.
const items = new Map();
const ids = [...new Set([...pages.values()].map((page) => page.pageprops?.wikibase_item).filter(Boolean))];
for (const batch of chunks(ids, 50)) {
  const data = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims|sitelinks', ids: batch.join('|') })}`);
  for (const [id, entity] of Object.entries(data.entities || {})) {
    const values = (prop) => (entity.claims?.[prop] || []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
    items.set(id, {
      types: values('P31'),
      jobs: values('P106'),
      convicted: (entity.claims?.P1399 || []).length > 0,
      languages: Object.keys(entity.sitelinks || {}).filter((key) => key.endsWith('wiki') && key !== 'commonswiki').length,
    });
  }
}

// 4. Choose.
const chosen = [];
for (const [title, stat] of stats) {
  const page = pages.get(title);
  if (!page || page.missing || page.ns !== 0 || page.redirect || page.pageprops?.disambiguation !== undefined) continue;
  if ((page.length || 0) < MIN_LENGTH || title === 'עמוד ראשי' || BLOCKED.has(title)) continue;
  if (NOT_CONTENT.test(title) || BLOCKED_WORDS.test(title)) continue;
  const item = items.get(page.pageprops?.wikibase_item);
  if (!item || item.types.some((type) => BLOCKED_TYPES.has(type))) continue;
  let kind;
  let limit;
  if (item.types.includes('Q5')) {
    if (item.convicted || item.jobs.some((job) => BLOCKED_JOBS.has(job)) || !item.jobs.some((job) => PEOPLE_JOBS.has(job))) continue;
    kind = 'people';
    limit = LIMITS.person;
  } else {
    kind = item.types.map((type) => KIND_OF.get(type)).find(Boolean);
    if (!kind) continue;
    limit = kind === 'nature' ? LIMITS.nature : ['place', 'brands'].includes(kind) ? LIMITS.strict : LIMITS.other;
  }
  if (stat.months < limit[0] && item.languages < limit[1]) continue;
  chosen.push({ title, kind, views: stat.views });
}

// 5. Ask once more, without following redirects: every title must be a real article.
const confirmed = new Set();
for (const batch of chunks(chosen.map((row) => row.title), 50)) {
  const data = await wikiApi({ action: 'query', prop: 'info|pageprops', ppprop: 'disambiguation', titles: batch.join('|') });
  for (const page of data.query?.pages || []) {
    if (!page.missing && page.ns === 0 && !page.redirect && page.pageprops?.disambiguation === undefined) confirmed.add(page.title);
  }
}
const final = chosen.filter((row) => confirmed.has(row.title)).sort((a, b) => b.views - a.views);
const kinds = {};
for (const row of final) (kinds[row.kind] ||= []).push(row.title);
const pool = {
  about: 'Article pool of the easy free game. Built by scripts/build-easy-pool.mjs from Hebrew Wikipedia pageviews and Wikidata; do not edit by hand.',
  built: now.toISOString().slice(0, 10),
  months: `${monthKeys.at(-1)}..${monthKeys[0]}`,
  count: final.length,
  kinds,
};
writeFileSync(OUT, `${JSON.stringify(pool, null, 1)}\n`);
console.log(`${final.length} titles:`, Object.entries(kinds).map(([kind, list]) => `${kind} ${list.length}`).join(', '));
