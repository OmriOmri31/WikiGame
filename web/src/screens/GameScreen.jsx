import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  fetchArticle,
  normalizeTitle,
  prepareArticleHtml,
  sameTitle,
  titleFromHref,
} from '../wikipedia';

const SECRET_CODE = 'Coys31';

export default function GameScreen({ playerName, onFinish }) {
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
  const [saveError, setSaveError] = useState(false);

  const pagesRef = useRef(1);
  const startRef = useRef(0);
  const currentTitleRef = useRef('');
  const goalTitleRef = useRef('');
  const finishedRef = useRef(false);
  const loadingRef = useRef(false);
  const pendingHashRef = useRef('');
  const scrollRef = useRef(null);
  const toastTimerRef = useRef(0);
  const tapsRef = useRef({ count: 0, last: 0 });
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setFatal('');
      setLoading(true);
      try {
        const snapshot = await getDoc(doc(db, 'daily', 'articles'));
        if (!snapshot.exists()) {
          throw new Error('missing');
        }
        const data = snapshot.data();
        const start = normalizeTitle(data.startArticleTitle);
        const goal = normalizeTitle(data.targetArticleTitle);
        if (!start || !goal) throw new Error('missing');

        const [startArticle, targetArticle] = await Promise.all([
          fetchArticle(start),
          fetchArticle(goal),
        ]);
        const [startHtml, targetHtml] = await Promise.all([
          prepareArticleHtml(startArticle.html),
          prepareArticleHtml(targetArticle.html),
        ]);
        if (cancelled) return;

        goalTitleRef.current = targetArticle.title;
        currentTitleRef.current = startArticle.title;
        pagesRef.current = 1;
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
        if (!cancelled) setFatal('לא ניתן לטעון את המאמרים היומיים.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGame();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!article) return undefined;
    document.title = `${article.title} – משחק הוויקיפדיה`;
    const hash = pendingHashRef.current;
    pendingHashRef.current = '';
    if (hash) {
      const id = hash.slice(1);
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        return undefined;
      }
    }
    scrollRef.current?.scrollTo(0, 0);
    return undefined;
  }, [article]);

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

  async function completeGame(pageCount) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRunning(false);
    const timeTaken = Math.round((Date.now() - startRef.current) * 100) / 100;
    setFinalTime(timeTaken);
    setCongratsOpen(true);

    try {
      const ref = await addDoc(collection(db, 'scores'), {
        name: playerName,
        pagesVisited: pageCount,
        timeTaken,
        timestamp: Timestamp.now(),
      });
      window.setTimeout(() => {
        onFinishRef.current({
          id: ref.id,
          timeTaken,
          pagesVisited: pageCount,
        });
      }, 2000);
    } catch (error) {
      console.error(error);
      setSaveError(true);
    }
  }

  async function openArticle(title, hash = '') {
    if (finishedRef.current || loadingRef.current) return;
    if (sameTitle(title, currentTitleRef.current)) {
      if (hash) {
        const id = hash.slice(1);
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      }
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    try {
      const next = await fetchArticle(title);
      const html = await prepareArticleHtml(next.html);
      if (finishedRef.current) return;

      const count = pagesRef.current + 1;
      pagesRef.current = count;
      setPages(count);
      currentTitleRef.current = next.title;
      pendingHashRef.current = hash;
      setArticle(next);
      setArticleHtml(html);

      if (sameTitle(next.title, goalTitleRef.current)) {
        await completeGame(count);
      }
    } catch (error) {
      console.error(error);
      showToast(error.code === 'missingtitle' ? 'הערך לא נמצא.' : 'לא הצלחנו לטעון את הערך.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function followLink(event, locked) {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) return;

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

  return (
    <main className="game">
      <header className="game-header" onClick={registerHeaderTap}>
        <p className="route-title">{startTitle}</p>
        <p className="arrow" aria-hidden="true">↓</p>
        <button
          className="target-link"
          type="button"
          onClick={() => setGoalOpen(true)}
        >
          {goalTitle}
        </button>
        <div className="info-row">
          <span>זמן: <bdi>{shownTime.toFixed(finalTime == null ? 1 : 2)}</bdi> שניות</span>
          <span>מספר הדפים: <bdi>{pages}</bdi></span>
        </div>
        {loading ? <div className="loading-bar" role="progressbar" aria-label="טוען ערך" /> : null}
      </header>

      <div className={`article-scroll ${loading ? 'is-loading' : ''}`} ref={scrollRef}>
        <article className="article-inner">
          <h1>{article.title}</h1>
          <div
            className="article-body"
            onClick={(event) => followLink(event, false)}
            dangerouslySetInnerHTML={{ __html: articleHtml }}
          />
        </article>
      </div>

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      {goalOpen && goalArticle ? (
        <section className="modal-sheet" role="dialog" aria-modal="true" aria-label={goalTitle}>
          <header className="sheet-header">
            <button className="linkish" type="button" onClick={() => setGoalOpen(false)}>
              חזור למהלך המשחק
            </button>
            <div className="info-row">
              <span>זמן: <bdi>{shownTime.toFixed(finalTime == null ? 1 : 2)}</bdi> שניות</span>
              <span>מספר הדפים: <bdi>{pages}</bdi></span>
            </div>
          </header>
          <div className="article-scroll">
            <article className="article-inner">
              <h1>{goalArticle.title}</h1>
              <p className="lede">זהו דף המטרה. הקישורים כאן לא מובילים לשום מקום.</p>
              <div
                className="article-body"
                onClick={(event) => followLink(event, true)}
                dangerouslySetInnerHTML={{ __html: goalHtml }}
              />
            </article>
          </div>
        </section>
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

      {congratsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card congrats" role="dialog" aria-modal="true" aria-label="סיום המשחק">
            <h2>כל הכבוד!</h2>
            <p>סיימת את המשחק ב-<bdi>{(finalTime ?? 0).toFixed(2)}</bdi> שניות.</p>
            <p>מספר הדפים שביקרת: <bdi>{pages}</bdi></p>
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
