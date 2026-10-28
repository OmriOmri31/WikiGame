import { confirmedArticle, pairHasLinks } from './wikiBot.js';
import { isMainPageTitle, normalizeTitle, sameTitle } from './wikipedia.js';

// Checks a start and goal a player typed for the "choose your own" free game. Both must be real
// Hebrew Wikipedia articles (redirects are followed to the article they lead to), not
// disambiguation pages or the main page, not the same article, and the game must be winnable
// by links. Returns { start, goal } with the real titles, or throws an error whose `field` is
// 'start', 'goal' or 'pair' and whose `message` is a Hebrew line for the player.
function problem(field, message) {
  const error = new Error(message);
  error.field = field;
  return error;
}

async function realTitle(input, field, deps) {
  const title = normalizeTitle(input);
  if (!title) throw problem(field, field === 'start' ? 'בחרו ערך פתיחה.' : 'בחרו ערך יעד.');
  let found;
  try {
    found = await deps.confirm(title);
  } catch (error) {
    if (error?.code === 'disambiguation') throw problem(field, 'זה דף פירושונים. בחרו ערך מדויק יותר.');
    if (error?.code === 'missingtitle') throw problem(field, 'אין ערך בשם הזה בוויקיפדיה.');
    throw problem('pair', 'לא הצלחנו לבדוק את הערכים. נסו שוב.');
  }
  if (isMainPageTitle(found)) throw problem(field, 'אפשר לבחור רק ערך רגיל.');
  return found;
}

export async function checkCustomPair(startInput, goalInput, deps = {}) {
  const tools = { confirm: confirmedArticle, links: pairHasLinks, ...deps };
  const [start, goal] = await Promise.all([
    realTitle(startInput, 'start', tools),
    realTitle(goalInput, 'goal', tools),
  ]);
  if (sameTitle(start, goal)) throw problem('pair', 'ערך הפתיחה וערך היעד הם אותו ערך. בחרו שני ערכים שונים.');
  let links = null;
  try {
    links = await tools.links(start, goal);
  } catch {
    // The link check is a courtesy. If it can't run, let the player try the pair.
  }
  if (links && !links.out) throw problem('start', 'בערך הזה אין קישורים לערכים אחרים, אז אי אפשר לצאת ממנו.');
  if (links && !links.in) throw problem('goal', 'אף ערך לא מקשר לערך הזה, אז אי אפשר להגיע אליו.');
  return { start, goal };
}
