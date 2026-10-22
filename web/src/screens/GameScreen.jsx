import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, Timestamp } from 'firebase/firestore';
import { accountName } from '../account';
import { db } from '../firebase';
import { saveLocalScore } from '../localScores';
import { exitFullscreen } from '../fullscreen';
import GameMenu from '../GameMenu';
import GameTools, { FindBar } from '../GameTools';
import { clearPageFind, collectPageMatches, paintPageFind, scrollMatchIntoView } from '../pageFind';
import Sheet from '../Sheet';
import { formatDuration } from '../time';
import { findShortestPath } from '../wikiBot';
import {
  fetchArticle,
  normalizeTitle,
  pickFreePlayPair,
  prepareArticleHtml,
  resolveStartTitle,
  sameTitle,
  titleFromHref,
} from '../wikipedia';

const SECRET_CODE = 'Coys31';

function scrollToHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return false;
  const ids = [raw];
  try {
    const decoded = decodeURIComponent(raw.replace(/\+/g, '%20'));
    if (!ids.includes(decoded)) ids.push(decoded);
  } catch {
    // Keep the raw fragment when it is not valid percent-encoding.
  }
  for (const id of ids) {
    const target = document.getElementById(id);
    if (!target) continue;
    target.scrollIntoView({ block: 'start' });
    return true;
  }
  return false;
}

function loadErrorMessage(mode, pair) {
  if (pair?.startTitle) return 'לא ניתן לטעון את הערכים האלה.';
  if (mode === 'free') return 'לא ניתן לטעון משחק חופשי.';
  return 'לא ניתן לטעון את המאמרים היומיים.';
}

export default function GameScreen({ user, mode = 'daily', pair = null, onFinish, onExit }) {
  const [startTitle, setStartTitle] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [article, setArticle] = useState(null);
  const [articleHtml, setArticleHtml] = useState('');
  const [goalArticle, setGoalArticle] = useState(null);
  const [goalHtml, setGoalHtml] = useState('');
  const [pages, setPages] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [finalTime, setFinalTime] = useState(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [congratsOpen, setCongratsOpen] = useState(false);
  const [seekingFastest, setSeekingFastest] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [backUses, setBackUses] = useState(3);
  const [searchTitle, setSearchTitle] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const [findCapped, setFindCapped] = useState(false);

  const pagesRef = useRef(1);
  const startRef = useRef(0);
  const pathRef = useRef([]);
  const startTitleRef = useRef('');
  const currentTitleRef = useRef('');
  const goalTitleRef = useRef('');
  const finishedRef = useRef(false);
  const loadingRef = useRef(false);
  const pendingHashRef = useRef('');
  const scrollRef = useRef(null);
  const toastTimerRef = useRef(0);
  const runRef = useRef(0);
  const lockedPairRef = useRef(null);
  const tapsRef = useRef({ count: 0, last: 0 });
  const articleRef = useRef(null);
  const cacheRef = useRef(new Map());
  const backUsesRef = useRef(3);
  const searchTitleRef = useRef(null);
  const searchOpenRef = useRef(false);
  const rangesRef = useRef([]);
  const findIndexRef = useRef(0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  searchOpenRef.current = searchOpen;
  const fixedStart = pair?.startTitle || '';
  const fixedGoal = pair?.goalTitle || '';

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  }

  function closeSearchIfOtherPage(title) {
    if (!searchTitleRef.current || sameTitle(searchTitleRef.current, title)) return;
    searchOpenRef.current = false;
    setSearchOpen(false);
  }

  function openSearch() {
    if (finishedRef.current) return;
    const here = currentTitleRef.current;
    if (!here) return;
    if (searchTitleRef.current && !sameTitle(searchTitleRef.current, here)) return;
    if (!searchTitleRef.current) {
      searchTitleRef.current = here;
      setSearchTitle(here);
    }
    searchOpenRef.current = true;
    setSearchOpen(true);
    setGoalOpen(false);
  }

  function toggleSearch() {
    if (searchTitleRef.current && !sameTitle(searchTitleRef.current, currentTitleRef.current)) return;
    if (searchOpenRef.current) {
      searchOpenRef.current = false;
      setSearchOpen(false);
      return;
    }
    openSearch();
  }

  function closeSearch() {
    searchOpenRef.current = false;
    setSearchOpen(false);
    document.querySelector('.search-tool')?.focus({ preventScroll: true });
  }

  function stepFind(delta) {
    const ranges = rangesRef.current;
    if (!ranges.length) return;
    const next = (findIndexRef.current + delta + ranges.length) % ranges.length;
    findIndexRef.current = next;
    setFindIndex(next);
    paintPageFind(ranges, next);
    scrollMatchIntoView(ranges[next], scrollRef.current);
  }

  function applyBack(entry) {
    const count = Math.max(1, pagesRef.current - 1);
    pagesRef.current = count;
    setPages(count);
    backUsesRef.current = Math.max(0, backUsesRef.current - 1);
    setBackUses(backUsesRef.current);
    pathRef.current = pathRef.current.slice(0, -1);
    const last = pathRef.current.length - 1;
    if (last >= 0 && !sameTitle(pathRef.current[last], entry.article.title)) {
      pathRef.current[last] = entry.article.title;
    }
    currentTitleRef.current = entry.article.title;
    pendingHashRef.current = '';
    setArticle(entry.article);
    setArticleHtml(entry.html);
    closeSearchIfOtherPage(entry.article.title);
  }

  async function goBack() {
    if (finishedRef.current || loadingRef.current) return;
    if (backUsesRef.current <= 0 || pathRef.current.length < 2 || pagesRef.current < 2) return;

    const previousTitle = pathRef.current[pathRef.current.length - 2];
    const cached = cacheRef.current.get(previousTitle);
    if (cached) {
      applyBack(cached);
      return;
    }

    const run = runRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const next = await fetchArticle(previousTitle);
      const html = await prepareArticleHtml(next.html);
      if (finishedRef.current || run !== runRef.current) return;
      cacheRef.current.set(next.title, { article: next, html });
      applyBack({ article: next, html });
    } catch (error) {
      console.error(error);
      showToast(error.code === 'missingtitle' ? 'הערך לא נמצא.' : 'לא הצלחנו לטעון את הערך.');
    } finally {
      if (run === runRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function chooseTitles() {
      if (lockedPairRef.current) {
        return {
          start: lockedPairRef.current.start,
          goal: lockedPairRef.current.goal,
          fixed: true,
        };
      }
      if (fixedStart && fixedGoal) {
        return { start: normalizeTitle(fixedStart), goal: normalizeTitle(fixedGoal), fixed: true };
      }
      if (mode === 'free') {
        const picked = await pickFreePlayPair();
        return { start: picked.start, goal: picked.goal, fixed: false };
      }
      const snapshot = await getDoc(doc(db, 'daily', 'articles'));
      if (!snapshot.exists()) throw new Error('missing');
      const data = snapshot.data();
      const goal = normalizeTitle(data.targetArticleTitle);
      const start = await resolveStartTitle(data.startArticleTitle, goal);
      if (!start || !goal) throw new Error('missing');
      return { start, goal, fixed: true };
    }

    async function loadGame() {
      setFatal('');
      setLoading(true);
      loadingRef.current = true;
      try {
        let chosen = await chooseTitles();
        let startArticle;
        let targetArticle;
        for (let index = 0; index < 3; index += 1) {
          [startArticle, targetArticle] = await Promise.all([
            fetchArticle(chosen.start),
            fetchArticle(chosen.goal),
          ]);
          if (!sameTitle(startArticle.title, targetArticle.title)) break;
          if (chosen.fixed || index === 2) throw new Error('same');
          chosen = await chooseTitles();
        }
        const [startHtml, targetHtml] = await Promise.all([
          prepareArticleHtml(startArticle.html),
          prepareArticleHtml(targetArticle.html),
        ]);
        if (cancelled) return;

        lockedPairRef.current = {
          start: startArticle.title,
          goal: targetArticle.title,
        };
        goalTitleRef.current = targetArticle.title;
        currentTitleRef.current = startArticle.title;
        startTitleRef.current = startArticle.title;
        pathRef.current = [startArticle.title];
        pagesRef.current = 1;
        cacheRef.current = new Map([[startArticle.title, { article: startArticle, html: startHtml }]]);
        setPages(1);
        setStartTitle(startArticle.title);
        setGoalTitle(targetArticle.title);
        setGoalArticle(targetArticle);
        setGoalHtml(targetHtml);
        setArticle(startArticle);
        setArticleHtml(startHtml);
        startRef.current = Date.now();
        setElapsed(0);
        setRunning(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) setFatal(loadErrorMessage(mode, fixedStart ? { startTitle: fixedStart } : null));
      } finally {
        if (!cancelled) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    }

    loadGame();
    return () => {
      cancelled = true;
    };
  }, [attempt, mode, fixedStart, fixedGoal]);

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 50);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!article) return undefined;
    document.title = `${article.title} – משחק הוויקיפדיה`;
    const hash = pendingHashRef.current;
    pendingHashRef.current = '';
    if (hash && scrollToHash(hash)) return undefined;
    scrollRef.current?.scrollTo(0, 0);
    return undefined;
  }, [article]);

  useEffect(() => {
    const root = articleRef.current;
    clearPageFind(root);
    rangesRef.current = [];
    if (!searchOpen || !findQuery.trim() || !root) {
      findIndexRef.current = 0;
      setFindIndex(0);
      setFindCount(0);
      setFindCapped(false);
      return undefined;
    }
    const { ranges, capped } = collectPageMatches(root, findQuery);
    rangesRef.current = ranges;
    findIndexRef.current = 0;
    setFindIndex(0);
    setFindCount(ranges.length);
    setFindCapped(capped);
    paintPageFind(ranges, 0);
    if (ranges[0]) scrollMatchIntoView(ranges[0], scrollRef.current);
    return () => clearPageFind(root);
  }, [searchOpen, findQuery, articleHtml]);

  useEffect(() => {
    const onKey = (event) => {
      if (finishedRef.current) return;
      if (event.key === 'Escape') {
        if (!searchOpenRef.current) return;
        event.preventDefault();
        searchOpenRef.current = false;
        setSearchOpen(false);
        document.querySelector('.search-tool')?.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'F3') {
        if (!searchOpenRef.current) return;
        event.preventDefault();
        stepFind(event.shiftKey ? -1 : 1);
        return;
      }
      const findShortcut = (event.ctrlKey || event.metaKey)
        && !event.altKey
        && !event.shiftKey
        && event.code === 'KeyF';
      if (!findShortcut) return;
      event.preventDefault();
      if (event.repeat || !currentTitleRef.current) return;
      const locked = searchTitleRef.current
        && !sameTitle(searchTitleRef.current, currentTitleRef.current);
      if (locked) {
        showToast('החיפוש זמין רק בדף אחד במשחק.');
        return;
      }
      if (searchOpenRef.current) {
        const input = document.getElementById('page-find-input');
        input?.focus();
        input?.select();
        return;
      }
      openSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onLeave = (event) => {
      if (finishedRef.current || fatal) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.clearTimeout(toastTimerRef.current);
    };
  }, [fatal]);

  async function shortestFreePath() {
    setSeekingFastest(true);
    try {
      const found = await findShortestPath(startTitleRef.current, goalTitleRef.current);
      return found?.path || [];
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async function storeScore(score) {
    if (!user?.uid) return saveLocalScore(score);
    const ref = await addDoc(collection(db, 'scores'), {
      uid: user.uid,
      name: accountName(user),
      pagesVisited: score.pagesVisited,
      timeTaken: score.timeTaken,
      timestamp: Timestamp.now(),
      mode: score.mode,
      startTitle: score.startTitle,
      goalTitle: score.goalTitle,
      path: score.path,
      ...(Array.isArray(score.fastestPath) ? { fastestPath: score.fastestPath } : {}),
      ...(score.gaveUp ? { gaveUp: true } : {}),
    });
    return { id: ref.id };
  }

  async function completeGame(pageCount) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRunning(false);
    searchOpenRef.current = false;
    setSearchOpen(false);
    exitFullscreen();
    const shownAt = Date.now();
    const timeTaken = Number(((shownAt - startRef.current) / 1000).toFixed(3));
    setFinalTime(timeTaken);
    setCongratsOpen(true);

    if (mode === 'preview') {
      const delay = Math.max(0, 2000 - (Date.now() - shownAt));
      window.setTimeout(() => {
        onFinishRef.current({
          id: '',
          timeTaken,
          pagesVisited: pageCount,
          mode: 'preview',
        });
      }, delay);
      return;
    }

    const scoreMode = mode === 'free' ? 'free' : 'daily';
    const fastest = scoreMode === 'free' ? await shortestFreePath() : null;
    if (scoreMode === 'free') setSeekingFastest(false);
    const finish = (id) => {
      const delay = Math.max(0, 2000 - (Date.now() - shownAt));
      window.setTimeout(() => {
        onFinishRef.current({
          id,
          timeTaken,
          pagesVisited: pageCount,
          mode: scoreMode,
        });
      }, delay);
    };

    try {
      const saved = await storeScore({
        name: 'שחקן',
        pagesVisited: pageCount,
        timeTaken,
        mode: scoreMode,
        startTitle: startTitleRef.current,
        goalTitle: goalTitleRef.current,
        path: pathRef.current.slice(),
        ...(fastest ? { fastestPath: fastest } : {}),
      });
      finish(saved.id);
    } catch (error) {
      console.error(error);
      setSaveError(true);
    }
  }

  function restartGame() {
    if (finishedRef.current) return;
    runRef.current += 1;
    loadingRef.current = true;
    finishedRef.current = false;
    pagesRef.current = 1;
    if (lockedPairRef.current) {
      currentTitleRef.current = lockedPairRef.current.start;
      pathRef.current = [lockedPairRef.current.start];
    }
    setPages(1);
    setElapsed(0);
    setFinalTime(null);
    setRunning(false);
    setGoalOpen(false);
    setSecretOpen(false);
    setCongratsOpen(false);
    setSaveError(false);
    setToast('');
    backUsesRef.current = 3;
    setBackUses(3);
    searchTitleRef.current = null;
    setSearchTitle(null);
    searchOpenRef.current = false;
    setSearchOpen(false);
    setFindQuery('');
    findIndexRef.current = 0;
    setFindIndex(0);
    setFindCount(0);
    setFindCapped(false);
    rangesRef.current = [];
    clearPageFind(articleRef.current);
    setLoading(true);
    scrollRef.current?.scrollTo(0, 0);
    setAttempt((value) => value + 1);
  }

  async function giveUp() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    runRef.current += 1;
    loadingRef.current = false;
    exitFullscreen();
    if (mode !== 'free') {
      onExit();
      return;
    }

    const timeTaken = Number(((Date.now() - startRef.current) / 1000).toFixed(3));
    const fastest = await shortestFreePath();
    try {
      const saved = await storeScore({
        name: 'שחקן',
        pagesVisited: pagesRef.current,
        timeTaken,
        mode: 'free',
        gaveUp: true,
        startTitle: startTitleRef.current,
        goalTitle: goalTitleRef.current,
        path: pathRef.current.slice(),
        fastestPath: fastest,
      });
      onFinishRef.current({
        id: saved.id,
        timeTaken,
        pagesVisited: pagesRef.current,
        mode: 'free',
      });
    } catch (error) {
      console.error(error);
      onExit();
    }
  }

  async function openArticle(title, hash = '') {
    if (finishedRef.current || loadingRef.current) return;
    if (sameTitle(title, currentTitleRef.current)) {
      if (hash) scrollToHash(hash);
      return;
    }

    const run = runRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const next = await fetchArticle(title);
      const html = await prepareArticleHtml(next.html);
      if (finishedRef.current || run !== runRef.current) return;

      const count = pagesRef.current + 1;
      pagesRef.current = count;
      setPages(count);
      currentTitleRef.current = next.title;
      pathRef.current = [...pathRef.current, next.title];
      cacheRef.current.set(next.title, { article: next, html });
      pendingHashRef.current = hash;
      setArticle(next);
      setArticleHtml(html);
      closeSearchIfOtherPage(next.title);

      if (sameTitle(next.title, goalTitleRef.current)) {
        await completeGame(count);
      }
    } catch (error) {
      console.error(error);
      showToast(error.code === 'missingtitle' ? 'הערך לא נמצא.' : 'לא הצלחנו לטעון את הערך.');
    } finally {
      if (run === runRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  function followLink(event, locked) {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) {
      event.preventDefault();
      scrollToHash(href);
      return;
    }

    event.preventDefault();
    const parsed = titleFromHref(href);
    if (locked) {
      if (parsed.kind !== 'hash') showToast('בדף המטרה אפשר רק לקרוא.');
      return;
    }
    if (parsed.kind === 'article') {
      openArticle(parsed.title, parsed.hash);
      return;
    }
    showToast('אפשר לנווט רק בין ערכי ויקיפדיה.');
  }

  function registerHeaderTap(event) {
    if (event.target.closest('button, a, input')) return;
    const now = Date.now();
    const previous = tapsRef.current;
    const count = now - previous.last < 2000 ? previous.count + 1 : 1;
    tapsRef.current = { count, last: now };
    if (count >= 5) {
      tapsRef.current = { count: 0, last: 0 };
      setSecretOpen(true);
    }
  }

  function submitSecret(event) {
    event.preventDefault();
    const code = secretInput;
    setSecretInput('');
    setSecretOpen(false);
    if (code === SECRET_CODE && goalArticle) {
      openArticle(goalArticle.title);
    }
  }

  const shownTime = finalTime ?? elapsed;

  if (fatal) {
    return (
      <main className="screen">
        <div className="card">
          <p className="form-error" role="alert">{fatal}</p>
          <button className="primary" type="button" onClick={() => setAttempt((value) => value + 1)}>
            נסו שוב
          </button>
        </div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="screen">
        <p className="status">טוען את המשחק…</p>
      </main>
    );
  }

  const stats = (
    <div className="info-row">
      <span className="stat">זמן: <bdi className="clock" dir="ltr">{formatDuration(shownTime, { milliseconds: false })}</bdi></span>
      <span className="stat">מספר הדפים: <bdi>{pages}</bdi></span>
    </div>
  );

  return (
    <main className="game">
      {congratsOpen || seekingFastest ? null : (
        <GameMenu onRestart={restartGame} onExit={giveUp} freePlay={mode === 'free'} />
      )}
      {congratsOpen || seekingFastest ? null : (
        <GameTools
          backUses={backUses}
          backDisabled={pages < 2 || backUses < 1 || loading}
          onFirstPage={pages < 2}
          onBack={goBack}
          searchDisabled={Boolean(searchTitle && !sameTitle(searchTitle, article.title))}
          searchOpen={searchOpen}
          onToggleSearch={toggleSearch}
        />
      )}
      <div className="article-scroll" ref={scrollRef}>
        <header className="game-header" onClick={registerHeaderTap}>
          <p className="route-title">{startTitle}</p>
          <p className="arrow" aria-hidden="true">↓</p>
          <button
            className="target-link"
            type="button"
            onClick={() => {
              if (searchOpenRef.current) {
                searchOpenRef.current = false;
                setSearchOpen(false);
              }
              setGoalOpen(true);
            }}
          >
            {goalTitle}
          </button>
          {stats}
          {searchOpen ? (
            <FindBar
              query={findQuery}
              onQueryChange={setFindQuery}
              matchIndex={findIndex}
              matchCount={findCount}
              matchCapped={findCapped}
              onNext={() => stepFind(1)}
              onPrev={() => stepFind(-1)}
              onCloseSearch={closeSearch}
            />
          ) : null}
          {loading ? <div className="loading-bar" role="progressbar" aria-label="טוען ערך" /> : null}
        </header>

        <article
          className={`article-inner mw-parser-output${loading ? ' is-loading' : ''}`}
          ref={articleRef}
        >
          <h1>{article.title}</h1>
          <div
            className="article-body"
            onClick={(event) => followLink(event, false)}
            dangerouslySetInnerHTML={{ __html: articleHtml }}
          />
        </article>
      </div>

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      {goalArticle ? (
        <Sheet
          open={goalOpen}
          onOpenChange={setGoalOpen}
          label={goalTitle}
          header={(
            <>
              <button className="linkish" type="button" onClick={() => setGoalOpen(false)}>
                חזור למהלך המשחק
              </button>
              {stats}
            </>
          )}
        >
          <article className="article-inner mw-parser-output">
            <h1>{goalArticle.title}</h1>
            <p className="lede">זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.</p>
            <div
              className="article-body"
              onClick={(event) => followLink(event, true)}
              dangerouslySetInnerHTML={{ __html: goalHtml }}
            />
          </article>
        </Sheet>
      ) : null}

      {secretOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSecretOpen(false)}>
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="קוד סודי"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitSecret}
          >
            <label htmlFor="secret-code">הזן קוד סודי:</label>
            <input
              id="secret-code"
              type="password"
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              placeholder="קוד סודי"
              autoFocus
            />
            <button className="primary" type="submit">שלח</button>
          </form>
        </div>
      ) : null}

      {seekingFastest && !congratsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-busy="true" aria-label="הדרך המהירה ביותר">
            <h2>הדרך המהירה ביותר</h2>
            <p className="status">מחפשים את הדרך. זה יכול לקחת כחצי דקה.</p>
          </div>
        </div>
      ) : null}

      {congratsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card congrats" role="dialog" aria-modal="true" aria-label="סיום המשחק">
            <h2>כל הכבוד!</h2>
            <p>סיימת את המשחק ב-<bdi className="clock" dir="ltr">{formatDuration(finalTime ?? 0, { milliseconds: false })}</bdi>.</p>
            <p>מספר הדפים שביקרת: <bdi>{pages}</bdi></p>
            {seekingFastest ? <p className="status">מחפשים את הדרך המהירה ביותר…</p> : null}
            {saveError ? (
              <>
                <p className="form-error">התרחשה שגיאה בשמירת הציון.</p>
                <button
                  className="primary"
                  type="button"
                  onClick={() => onFinishRef.current({
                    id: '',
                    timeTaken: finalTime ?? 0,
                    pagesVisited: pages,
                    mode: mode === 'free' ? 'free' : 'daily',
                  })}
                >
                  אל טבלת השיאים
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
