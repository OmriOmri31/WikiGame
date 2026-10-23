// Puts an invisible character between letters of the game article so the
// browser's own "Find in page" can't match words. The character is a private
// use code point drawn by a tiny zero-width font (see styles.css), so the
// text looks and wraps exactly as before. The in-game find strips it again.
export const GUARD = '\uE000';
const GUARD_RE = /\uE000/g;
const BETWEEN_LETTERS = /(\p{L}\p{M}*)(?=\p{L})/gu;
const SKIP = 'style, script, noscript, code, pre, kbd, samp, math, textarea, input';

export function stripGuard(text) {
  return text.indexOf(GUARD) < 0 ? text : text.replace(GUARD_RE, '');
}

function usesGuardFont(element, cache) {
  let ok = cache.get(element);
  if (ok === undefined) {
    ok = getComputedStyle(element).fontFamily.trim().startsWith('WikiZW');
    cache.set(element, ok);
  }
  return ok;
}

export function guardText(root) {
  if (!root) return;
  const cache = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue;
    if (!value || value.length < 2 || value.indexOf(GUARD) >= 0) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP) || !usesGuardFont(parent, cache)) continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    const next = node.nodeValue.replace(BETWEEN_LETTERS, `$1${GUARD}`);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
}

export function onGuardedCopy(event) {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  if (!text || text.indexOf(GUARD) < 0 || !event.clipboardData) return;
  event.preventDefault();
  event.clipboardData.setData('text/plain', stripGuard(text));
}
