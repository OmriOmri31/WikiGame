import { GUARD } from './findGuard';

const FIND_ALL = 'page-find';
const FIND_CURRENT = 'page-find-current';
const MATCH_LIMIT = 300;

function highlightsAvailable() {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && CSS.highlights;
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

export function clearPageFind(root) {
  if (highlightsAvailable()) {
    CSS.highlights.delete(FIND_ALL);
    CSS.highlights.delete(FIND_CURRENT);
  }
  if (!root) return;
  root.querySelectorAll('mark.page-find').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function collectPageMatches(root, query) {
  const needle = query.toLowerCase();
  const ranges = [];
  if (!root || !needle) return { ranges, capped: false };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: acceptText });
  let capped = false;
  let node = walker.nextNode();
  while (node) {
    const raw = node.nodeValue;
    // Search the text without the find-guard characters, then map the hit
    // back to offsets in the real text node.
    let hay = raw;
    let map = null;
    if (raw.indexOf(GUARD) >= 0) {
      map = [];
      let clean = '';
      for (let i = 0; i < raw.length; i += 1) {
        if (raw[i] === GUARD) continue;
        map.push(i);
        clean += raw[i];
      }
      map.push(raw.length);
      hay = clean;
    }
    hay = hay.toLowerCase();
    let from = 0;
    while (from < hay.length) {
      const index = hay.indexOf(needle, from);
      if (index < 0) break;
      const range = new Range();
      range.setStart(node, map ? map[index] : index);
      range.setEnd(node, map ? map[index + needle.length - 1] + 1 : index + needle.length);
      ranges.push(range);
      if (ranges.length >= MATCH_LIMIT) {
        capped = true;
        return { ranges, capped };
      }
      from = index + needle.length;
    }
    node = walker.nextNode();
  }
  return { ranges, capped };
}

function paintWithHighlights(ranges, index) {
  CSS.highlights.delete(FIND_ALL);
  CSS.highlights.delete(FIND_CURRENT);
  if (!ranges.length) return;
  const current = ranges[index] || ranges[0];
  const rest = new Highlight();
  ranges.forEach((range, rangeIndex) => {
    if (rangeIndex !== index) rest.add(range);
  });
  CSS.highlights.set(FIND_ALL, rest);
  CSS.highlights.set(FIND_CURRENT, new Highlight(current));
}

function paintWithMarks(ranges, index) {
  const existing = document.querySelectorAll('mark.page-find');
  if (existing.length === ranges.length && existing.length > 0) {
    existing.forEach((mark, markIndex) => {
      mark.classList.toggle('is-current', markIndex === index);
    });
    return;
  }
  const ordered = ranges
    .map((range, rangeIndex) => ({ range, rangeIndex }))
    .sort((a, b) => b.range.compareBoundaryPoints(Range.START_TO_START, a.range));
  ordered.forEach(({ range, rangeIndex }) => {
    const mark = document.createElement('mark');
    mark.className = `page-find${rangeIndex === index ? ' is-current' : ''}`;
    try {
      range.surroundContents(mark);
    } catch {
      // A range that is not a single text span cannot be wrapped.
    }
  });
}

export function paintPageFind(ranges, index) {
  if (!ranges.length) {
    if (highlightsAvailable()) {
      CSS.highlights.delete(FIND_ALL);
      CSS.highlights.delete(FIND_CURRENT);
    }
    return;
  }
  const current = Math.min(Math.max(index, 0), ranges.length - 1);
  if (highlightsAvailable()) {
    paintWithHighlights(ranges, current);
    return;
  }
  paintWithMarks(ranges, current);
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
