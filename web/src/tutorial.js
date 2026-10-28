import { normalizeTitle } from './wikipedia.js';

// The interactive tutorial plays a short, fixed game on four small pages that ship with the app,
// so it works the same every time, offline, and loads instantly. The texts are short summaries
// written for the tutorial, laid out like Wikipedia articles.
export const TUTORIAL_PAIR = { startTitle: 'פיצה', goalTitle: 'רומא' };
// The link the player follows by mistake, to try the back arrow, and the word they search for.
export const TUTORIAL_DETOUR = 'גבינה';
export const TUTORIAL_WAY = 'איטליה';

const link = (title, text = title) => `<a href="/wiki/${encodeURIComponent(title)}" title="${title}">${text}</a>`;

const PAGES = {
  'פיצה': `<p><b>פיצה</b> היא מאכל אפוי שעשוי מבצק שטוח, ומעליו בדרך כלל ${link('רוטב עגבניות')} ו${link('גבינה')}.
אפשר להוסיף לה תוספות רבות: זיתים, פטריות, בצל, תירס ועוד.</p>
<p>הפיצה נאפית בתנור חם מאוד, לפעמים בתנור עצים, בתוך דקות ספורות. היא נמכרת שלמה או במשולשים,
ואוכלים אותה בבית, במסעדות ובדוכנים בכל העולם.</p>
<h2>היסטוריה</h2>
<p>לחם שטוח עם תוספות אכלו כבר בימי קדם. הפיצה המוכרת לנו נולדה במאה ה־18 בעיר נאפולי שב${link('איטליה')},
ומשם התפשטה, בעיקר עם מהגרים, לכל העולם.</p>
<p>הפיצה הקלאסית של נאפולי היא פיצה מרגריטה: עגבניות, מוצרלה ועלי בזיליקום, בצבעי הדגל של המדינה.</p>`,
  'גבינה': `<p><b>גבינה</b> היא מזון שמכינים מ${link('חלב')}. החלב מחמיץ או נקרש, ואז מפרידים ממנו את המים.
יש אלפי סוגי גבינה: רכות וקשות, טריות ומיושנות, מחלב פרה, עזים או כבשים.</p>
<p>גבינות קשות, כמו פרמזן, מתיישנות חודשים ואפילו שנים. גבינות טריות, כמו קוטג', אוכלים בתוך ימים.</p>
<p>גבינת מוצרלה, שנמתחת כשהיא חמה, היא הגבינה של רוב הפיצות.</p>`,
  'איטליה': `<p><b>איטליה</b> היא מדינה בדרום ${link('אירופה')}. רובה חצי אי בצורת מגף, שנכנס לים התיכון,
ויש לה גם שני איים גדולים: סיציליה וסרדיניה.</p>
<p>בירת איטליה והעיר הגדולה בה היא ${link('רומא')}. ערים מוכרות נוספות הן מילאנו, נאפולי, פירנצה וונציה.</p>
<p>איטליה מפורסמת באמנות, באדריכלות ובמטבח שלה: פסטה, פיצה, גלידה ואספרסו הגיעו ממנה לכל העולם.</p>`,
  'רומא': `<p><b>רומא</b> היא בירת ${link('איטליה')} והעיר הגדולה בה. היא שוכנת על נהר הטיבר, ונקראת גם
"העיר הנצחית".</p>
<p>ברומא יש שרידים רבים מימי האימפריה הרומית, כמו הקולוסיאום והפורום הרומי. בתוך העיר נמצאת גם
קריית הוותיקן, המדינה הקטנה בעולם.</p>
<p>מדי שנה מגיעים לרומא מיליוני תיירים, שזורקים מטבעות למזרקת טרווי.</p>`,
};

export function tutorialArticle(title) {
  const key = normalizeTitle(title);
  const html = PAGES[key];
  if (!html) {
    // Links that aren't part of the tutorial stay covered by the overlay; this is a safety net.
    const error = new Error('missing');
    error.code = 'missingtitle';
    return Promise.reject(error);
  }
  return Promise.resolve({ title: key, html: `<div class="mw-parser-output">${html}</div>` });
}

const linkSelector = (title) => `.article-scroll .article-body a[title="${title}"]`;

// Each step: what is lit up (a CSS selector), the line next to it, and what moves it on:
// 'next' (a "הבא" button), or an event from the game (see GameScreen). The last step sits on the
// end screen, whose own button closes the tutorial.
export const TUTORIAL_STEPS = [
  { id: 'start', target: '.route-title', text: 'כאן מתחילים: זה הערך שאתם נמצאים בו עכשיו.', next: true },
  { id: 'goal', target: '.target-link', text: 'וזה ערך היעד. המטרה: להגיע אליו בכמה שפחות דפים.', next: true },
  { id: 'hint', target: '.goal-hint', text: 'לא בטוחים מה זה? הקישו כאן כדי לקרוא את ערך היעד.', on: 'goal-open' },
  { id: 'goal-close', target: '.sheet-header .linkish', text: 'בערך היעד רק קוראים, הקישורים בו לא פעילים. חוזרים למשחק.', on: 'goal-close' },
  { id: 'link', target: linkSelector(TUTORIAL_DETOUR), text: 'הקישו על קישור כחול כדי לעבור לערך שלו. נסו את "גבינה".', on: `page:${TUTORIAL_DETOUR}` },
  { id: 'back', target: '.back-button', text: 'לא לשם רצינו. החץ מחזיר לדף הקודם (3 פעמים בכל משחק).', on: 'back' },
  { id: 'search', target: '.search-tool', text: 'הזכוכית המגדלת מחפשת מילה בדף. הקישו עליה.', on: 'search-open' },
  { id: 'type', target: '.find-bar', text: 'כתבו "איטליה", כי רומא נמצאת באיטליה.', on: 'found' },
  { id: 'way', target: linkSelector(TUTORIAL_WAY), text: 'מצאנו! הקישו על "איטליה".', on: `page:${TUTORIAL_WAY}` },
  { id: 'win', target: linkSelector(TUTORIAL_PAIR.goalTitle), text: 'הנה ערך היעד. הקישו על "רומא" כדי לנצח.', on: 'win' },
  { id: 'done', target: '.congrats', text: 'הגעתם! כל מעבר הוא דף במונה. מי שמגיע בפחות דפים מנצח, ובשוויון קובע הזמן.' },
];

// The step that comes after `index` once `event` happens, or `index` when the event doesn't move it.
export function nextTutorialStep(index, event) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return index;
  if (event === 'next' ? step.next : step.on === event) return Math.min(index + 1, TUTORIAL_STEPS.length - 1);
  return index;
}
