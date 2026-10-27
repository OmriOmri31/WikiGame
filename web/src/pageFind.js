// In-game find in page. It never changes the article: matches are found as DOM Ranges over the
// existing text and painted with the CSS Custom Highlight API. Browsers without it (iPhones before
// iOS 17.2) get one box drawn over the current match, outside the article. Nothing here runs when
// an article loads; it runs only while the player types in the find bar or steps between matches.
const FIND_ALL = 'page-find';
const FIND_CURRENT = 'page-find-current';
export const MATCH_LIMIT = 300;

let spot = null;

function highlightsAvailable() {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && Boolean(CSS.highlights);
}

// Start offsets of `needle` in `hay` (both already lower-cased), without overlaps, at most `limit`.
export function matchOffsets(hay, needle, limit = MATCH_LIMIT) {
  const found = [];
  if (!needle || limit < 1) return found;
  let from = 0;
  while (from <= hay.length - needle.length) {
    const index = hay.indexOf(needle, from);
    if (index < 0) break;
    found.push(index);
    if (found.length >= limit) break;
    from = index + needle.length;
  }
  return found;
}

function acceptText(node) {
  if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
  const parent = node.parentElement;
  if (!parent) return NodeFilter.FILTER_REJECT;
  if (parent.closest('style, script, noscript, .mobileonly, [hidden]')) {
    return NodeFilter.FILTER_REJECT;
  }
  return NodeFilter.FILTER_ACCEPT;
}

function removeSpot() {
  if (spot) spot.remove();
  spot = null;
}

export function clearPageFind() {
  if (highlightsAvailable()) {
    CSS.highlights.delete(FIND_ALL);
    CSS.highlights.delete(FIND_CURRENT);
  }
  removeSpot();
}

export function collectPageMatches(root, query) {
  const needle = query.toLowerCase();
  const ranges = [];
  if (!root || !needle) return { ranges, capped: false };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: acceptText });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const offsets = matchOffsets(node.nodeValue.toLowerCase(), needle, MATCH_LIMIT - ranges.length);
    for (const index of offsets) {
      const range = new Range();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      ranges.push(range);
    }
    if (ranges.length >= MATCH_LIMIT) return { ranges, capped: true };
  }
  return { ranges, capped: false };
}

function paintWithHighlights(ranges, index) {
  const rest = new Highlight();
  ranges.forEach((range, rangeIndex) => {
    if (rangeIndex !== index) rest.add(range);
  });
  CSS.highlights.set(FIND_ALL, rest);
  CSS.highlights.set(FIND_CURRENT, new Highlight(ranges[index]));
}

function paintWithSpot(range, scroller) {
  if (!scroller) return;
  const rect = range.getClientRects()[0] || range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    removeSpot();
    return;
  }
  const box = scroller.getBoundingClientRect();
  if (!spot || spot.parentNode !== scroller) {
    removeSpot();
    spot = document.createElement('div');
    spot.className = 'find-spot';
    spot.setAttribute('aria-hidden', 'true');
    scroller.appendChild(spot);
  }
  spot.style.top = `${rect.top - box.top + scroller.scrollTop}px`;
  spot.style.left = `${rect.left - box.left + scroller.scrollLeft}px`;
  spot.style.width = `${rect.width}px`;
  spot.style.height = `${rect.height}px`;
}

// `scroller` is the element that scrolls the article; the fallback box is placed inside it.
export function paintPageFind(ranges, index, scroller) {
  if (!ranges.length) {
    clearPageFind();
    return;
  }
  const current = Math.min(Math.max(index, 0), ranges.length - 1);
  if (highlightsAvailable()) {
    paintWithHighlights(ranges, current);
    return;
  }
  paintWithSpot(ranges[current], scroller);
}

export function scrollMatchIntoView(range, scroller) {
  if (!range || !scroller) return;
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;
  const scrollerRect = scroller.getBoundingClientRect();
  const header = scroller.querySelector('.game-header');
  const headerBottom = header ? header.getBoundingClientRect().bottom : scrollerRect.top;
  const findBar = document.querySelector('.find-bar');
  const overlayBottom = Math.max(headerBottom, findBar ? findBar.getBoundingClientRect().bottom : 0);
  const viewTop = overlayBottom + 8;
  const viewBottom = scrollerRect.bottom - 12;
  if (rect.top >= viewTop && rect.bottom <= viewBottom) return;
  scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + rect.top - viewTop), behavior: 'auto' });
}
