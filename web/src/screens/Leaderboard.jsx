import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { publicName } from '../account';
import { topAndPins, rankOf } from '../boardLayout';
import { enterFullscreen } from '../fullscreen';
import { db } from '../firebase';
import { subscribeFastestPaths } from '../fastestSearch';
import { loadLocalScores } from '../localScores';
import Stage from '../Stage';
import ThemeButton from '../ThemeButton';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';
import { subscribeBot } from '../botRun';
import { isReasoner, REASONER_NAME } from '../reasonerBot';
import { isWikiBot, pathLinkNames, WIKI_BOT_NAME } from '../wikiBot';
import { articleUrl, israelDateKey, normalizeTitle } from '../wikipedia';

// Firestore rules allow create but not delete, so probe scores stay hidden here.
const IGNORED_SCORE_IDS = new Set([
  'Gxd5TIH6fiMMgK4qqznp',
  'WBwWbEGmFysvc440EjO8',
  'mXPsH85ZrHsQGW4OfskY',
  'GocwcHCAmyGj9QUz3OBf',
  'wiki-bot-rulecheck',
]);

function latestForUser(rows, uid) {
  if (!uid) return null;
  return rows.reduce((latest, row) => {
    if (row.uid !== uid) return latest;
    if (!latest || timestampMillis(row.timestamp) >= timestampMillis(latest.timestamp)) return row;
    return latest;
  }, null);
}

function savedPath(row) {
  if (!Array.isArray(row?.path)) return [];
  return row.path.map((title) => normalizeTitle(title)).filter(Boolean);
}

function fastestPath(row) {
  if (!Array.isArray(row?.fastestPath)) return null;
  return row.fastestPath.map((title) => normalizeTitle(title)).filter(Boolean);
}

function canReplay(row) {
  return Boolean(normalizeTitle(row?.startTitle) && normalizeTitle(row?.goalTitle));
}

function winKey(row) {
  const start = normalizeTitle(row?.startTitle);
  const goal = normalizeTitle(row?.goalTitle);
  if (!start || !goal) return '';
  return `${start}\n${goal}`;
}

function ScoreActions({ row, onShowPath, onShowFastest, onReplay, allowReplay, showPath = true, showFastest = false }) {
  const replayReady = allowReplay && canReplay(row);
  return (
    <div className="score-actions">
      {showPath ? (
        <button className="text-button compact" type="button" onClick={() => onShowPath(row)}>
          הצג דרך
        </button>
      ) : null}
      {showFastest ? (
        <button className="text-button compact" type="button" onClick={() => onShowFastest(row)}>
          {WIKI_BOT_NAME}
        </button>
      ) : null}
      <button
        className="text-button compact"
        type="button"
        onClick={() => onReplay(row)}
        disabled={!replayReady}
      >
        שחק שוב
      </button>
    </div>
  );
}

function rowName(row) {
  if (isWikiBot(row)) return WIKI_BOT_NAME;
  if (isReasoner(row)) return REASONER_NAME;
  return publicName(row?.name);
}

function OfficialMark() {
  return (
    <span className="official-mark">
      <svg className="official-seal" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.7 8.2 7 10.4 11.3 5.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      רשמי
    </span>
  );
}

function DailyRow({ row, rank, highlighted, onShowPath, onReplay, allowReplay, showPath }) {
  return (
    <div
      id={`score-${row.id}`}
      className={['score-row', highlighted ? 'is-player' : '', isWikiBot(row) ? 'is-fastest' : '', isReasoner(row) ? 'is-reasoner' : ''].filter(Boolean).join(' ')}
    >
      <div className="score-main">
        <span className={Number.isInteger(rank) && rank <= 3 ? 'num is-medal' : 'num'}>{rank ?? '—'}</span>
        <span className="name">
          <span className="name-text">{rowName(row)}</span>
          {isReasoner(row) ? <OfficialMark /> : null}
          {row.gaveUp ? <span className="give-up-mark">ויתור</span> : null}
        </span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num">
          {isWikiBot(row) ? null : <bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi>}
        </span>
      </div>
      <ScoreActions
        row={row}
        onShowPath={onShowPath}
        onReplay={onReplay}
        allowReplay={allowReplay}
        showPath={showPath}
      />
    </div>
  );
}

function FreePlayRow({ row, highlighted, searching, onShowPath, onShowFastest, onReplay, allowReplay }) {
  return (
    <div
      id={`score-${row.id}`}
      className={highlighted ? 'score-row is-player' : 'score-row'}
    >
      <div className="score-main free-main">
        <span>{formatScoreDate(row.timestamp)}</span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num"><bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi></span>
      </div>
      <p className="free-route" dir="rtl">
        <bdi>{row.startTitle || '—'}</bdi>
        <span className="path-sep" aria-hidden="true"> ← </span>
        <bdi>{row.goalTitle || '—'}</bdi>
        {row.gaveUp ? <span className="give-up-mark">ויתור</span> : null}
      </p>
      {searching ? (
        <p className="status free-search" role="status">מחפשים את הדרך המהירה ביותר…</p>
      ) : null}
      <ScoreActions
        row={row}
        onShowPath={onShowPath}
        onShowFastest={onShowFastest}
        onReplay={onReplay}
        allowReplay={allowReplay}
        showPath={savedPath(row).length > 0}
        showFastest={Array.isArray(row.fastestPath)}
      />
    </div>
  );
}

function PathLine({ titles, vias }) {
  return (
    <p className="path-line" dir="rtl">
      {titles.map((title, index) => {
        const via = index > 0 && Array.isArray(vias) ? (vias[index - 1] || '') : '';
        return (
          <span className="path-step" key={`${title}-${index}`}>
            {index > 0 ? <span className="path-sep" aria-hidden="true">←</span> : null}
            {via ? <span className="path-via">לחצו על <bdi>{via}</bdi></span> : null}
            <a href={articleUrl(title)} target="_blank" rel="noopener noreferrer">
              <bdi>{title}</bdi>
            </a>
          </span>
        );
      })}
    </p>
  );
}

export default function Leaderboard({ user, highlightId, highlightMode, onHome, onPlayAgain }) {
  const [scores, setScores] = useState([]);
  const [freePlays, setFreePlays] = useState([]);
  const [playerScore, setPlayerScore] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceDaily, setDeviceDaily] = useState([]);
  const [pinBlocks, setPinBlocks] = useState([]);
  const [fastestToday, setFastestToday] = useState(null);
  const [reasonerGiveUps, setReasonerGiveUps] = useState([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [wonKeys, setWonKeys] = useState(() => new Set());
  const [botPhase, setBotPhase] = useState('idle');
  const [reloadToken, setReloadToken] = useState(0);
  const [pathView, setPathView] = useState(null);
  const [fastestLive, setFastestLive] = useState({ pendingIds: [], paths: {} });
  const [hopNotes, setHopNotes] = useState(null);
  const pathDialogRef = useRef(null);
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  useEffect(() => subscribeFastestPaths(setFastestLive), []);

  useEffect(() => subscribeBot((next) => {
    setBotPhase(next);
    if (next === 'done') setReloadToken((value) => value + 1);
  }), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const local = loadLocalScores();
      const localDaily = local
        .filter((row) => row.mode !== 'free')
        .sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
      const localFree = local.filter((row) => row.mode === 'free');
      let readable = [];
      let remoteError = '';

      try {
        const snapshot = await getDocs(collection(db, 'scores'));
        readable = snapshot.docs
          .filter((entry) => !IGNORED_SCORE_IDS.has(entry.id))
          .map((entry) => ({ id: entry.id, ...entry.data() }));
      } catch (loadError) {
        console.error(loadError);
        remoteError = 'לא הצלחנו לטעון את טבלת השיאים.';
      }

      if (cancelled) return;

      const todayKey = israelDateKey(new Date());
      const fastest = readable
        .filter((row) => (
          isWikiBot(row)
          && !row.gaveUp
          && !row.lock
          && row.mode !== 'free'
          && Array.isArray(row.path)
          && row.path.length > 0
          && israelDateKey(new Date(timestampMillis(row.timestamp))) === todayKey
        ))
        .sort((a, b) => Number(a.pagesVisited) - Number(b.pagesVisited) || timestampMillis(a.timestamp) - timestampMillis(b.timestamp))[0] || null;

      const rows = readable.filter((row) => (
        row.mode !== 'free'
        && !row.gaveUp
        && !row.lock
        && !isWikiBot(row)
        && typeof row.name === 'string'
        && row.name.trim()
      ));

      rows.sort((a, b) => {
        const pages = Number(a.pagesVisited) - Number(b.pagesVisited);
        if (pages) return pages;
        const time = Number(a.timeTaken) - Number(b.timeTaken);
        if (time) return time;
        return timestampMillis(a.timestamp) - timestampMillis(b.timestamp);
      });

      const uid = user?.uid || '';
      const mineFree = [
        ...readable.filter((row) => row.mode === 'free' && row.uid === uid),
        ...localFree,
      ].sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));

      let mine = null;
      if (highlightMode !== 'free' && highlightId && uid) {
        const highlighted = rows.find((row) => row.id === highlightId && row.uid === uid);
        if (highlighted) mine = highlighted;
      }
      if (!mine) mine = latestForUser(rows, uid);
      const bot = rows.find(isReasoner) || null;
      const { top, blocks } = topAndPins(rows, { player: mine, bot });

      const won = new Set();
      const addWin = (row) => {
        if (!row || row.mode === 'free' || isWikiBot(row) || row.gaveUp || row.lock) return;
        const key = winKey(row);
        if (key) won.add(key);
      };
      if (uid) readable.forEach((row) => {
        if (row.uid === uid) addWin(row);
      });
      localDaily.forEach(addWin);

      setScores(top);
      setFreePlays(mineFree);
      setDeviceDaily(localDaily);
      setPinBlocks(blocks);
      setFastestToday(fastest);
      setReasonerGiveUps(readable.filter((row) => (
        isReasoner(row)
        && row.gaveUp
        && !row.lock
        && row.mode !== 'free'
        && typeof row.name === 'string'
        && row.name.trim()
      )));
      setWonKeys(won);
      setPlayerScore(mine || null);
      setPlayerRank(rankOf(rows, mine?.id));
      setError(remoteError);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [highlightId, highlightMode, reloadToken, user]);

  useEffect(() => {
    if (loading || !highlightId) return undefined;
    document.getElementById(`score-${highlightId}`)?.scrollIntoView({ block: 'center' });
    return undefined;
  }, [highlightId, loading, scores, freePlays, deviceDaily]);

  useEffect(() => {
    if (!pathView) return undefined;
    pathDialogRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setPathView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathView]);

  useEffect(() => {
    if (!pathView) {
      setHopNotes(null);
      return undefined;
    }
    const row = pathView.row;
    const fastest = pathView.kind === 'fastest';
    const titles = fastest ? (fastestPath(row) || []) : savedPath(row);
    const annotate = fastest || isWikiBot(row);
    if (!annotate || titles.length < 2) {
      setHopNotes([]);
      return undefined;
    }
    const stored = fastest ? row.fastestVia : row.pathVia;
    if (Array.isArray(stored) && stored.length === titles.length - 1) {
      setHopNotes(stored.map((item) => (typeof item === 'string' ? item : '')));
      return undefined;
    }
    let cancelled = false;
    setHopNotes(null);
    pathLinkNames(titles).then((notes) => {
      if (!cancelled) setHopNotes(notes);
    }).catch((error) => {
      console.error(error);
      if (!cancelled) setHopNotes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [pathView]);

  const highlightedId = playerScore?.id;
  const pathRow = pathView?.row || null;
  const showingFastest = pathView?.kind === 'fastest';
  const pathTitles = showingFastest ? (fastestPath(pathRow) || []) : savedPath(pathRow);
  const pathHeading = showingFastest || isWikiBot(pathRow) ? WIKI_BOT_NAME : 'הדרך';
  const boardHasRows = scores.length > 0 || pinBlocks.length > 0 || reasonerGiveUps.length > 0;

  function showDailyPath(row) {
    const key = winKey(row);
    if (key && wonKeys.has(key)) return true;
    if (!key && ((user?.uid && row.uid === user.uid) || row.local)) return true;
    return false;
  }
  const savedOnDevice = deviceDaily.some((row) => row.id === highlightId)
    || freePlays.some((row) => row.local && row.id === highlightId);

  function showPlayed(row) {
    setPathView({ row, kind: 'played' });
  }

  function showFastest(row) {
    setPathView({ row, kind: 'fastest' });
  }

  function replay(row) {
    if (!canReplay(row)) return;
    enterFullscreen();
    onPlayAgain(row);
  }

  function renderDaily(row, rank, highlighted) {
    return (
      <DailyRow
        key={row.id}
        row={row}
        rank={rank}
        highlighted={highlighted}
        onShowPath={showPlayed}
        onReplay={replay}
        allowReplay
        showPath={showDailyPath(row)}
      />
    );
  }

  return (
    <Stage className="stage-board">
      <header className="stage-bar">
        <p className="wordmark">משחק <em>הוויקיפדיה</em></p>
        <div className="stage-actions">
          <ThemeButton />
          <button className="pill pill-quiet" type="button" onClick={() => onHomeRef.current()}>
            חזרה
          </button>
        </div>
      </header>
      <main className="board">
        <div className="board-scroll">
          <p className="kicker">טבלה</p>
          <h1>השיאים</h1>
          <p className="lede">הדירוג לפי מספר הצעדים, ואחר כך לפי הזמן.</p>
          {highlightId ? (
            <p className="saved-note" role="status">
              {savedOnDevice ? 'התוצאה נשמרה במכשיר הזה.' : 'התוצאה שלכם מסומנת בטבלה.'}
            </p>
          ) : null}

          <div className="board-columns">
            <section aria-label="משחק יומי">
              <h2>משחק יומי</h2>

              {loading ? <p className="status">טוען תוצאות…</p> : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}

              {botPhase === 'running' ? <p className="status">מחפשים את הדרך המהירה ביותר…</p> : null}

              {!loading && !boardOpen && playerScore ? (
                <div className="mine-strip">
                  <h3>התוצאה שלי</h3>
                  <div className="score-table">
                    <div className="score-head">
                      <span>מקום</span>
                      <span>שם</span>
                      <span>צעדים</span>
                      <span>זמן</span>
                    </div>
                    {renderDaily(playerScore, playerRank, true)}
                  </div>
                </div>
              ) : null}
              {!loading && !boardOpen && !playerScore && deviceDaily.length === 0 ? (
                <p className="empty">{boardHasRows ? 'עדיין אין לך תוצאה בטבלה.' : 'עדיין אין תוצאות.'}</p>
              ) : null}

              {fastestToday ? (
                <aside className="fastest-route">
                  <div className="fastest-copy">
                    <h3>{WIKI_BOT_NAME}</h3>
                    <p>
                      המסלול הקצר למשחק של היום
                      <span className="fastest-steps">
                        <bdi dir="ltr">{fastestToday.pagesVisited}</bdi>
                        {' '}
                        צעדים
                      </span>
                    </p>
                  </div>
                  {showDailyPath(fastestToday) ? (
                    <button className="text-button compact" type="button" onClick={() => showPlayed(fastestToday)}>
                      הצג דרך
                    </button>
                  ) : null}
                </aside>
              ) : null}

              {boardHasRows ? (
                <button
                  className="board-disclosure"
                  type="button"
                  aria-expanded={boardOpen}
                  onClick={() => setBoardOpen((open) => !open)}
                >
                  <span>{boardOpen ? 'הסתרת הטבלה' : 'טבלת השיאים'}</span>
                  <span className="board-chevron" aria-hidden="true" />
                </button>
              ) : null}

              {boardOpen && scores.length > 0 ? (
                <div className="score-table">
                  <div className="score-head">
                    <span>מקום</span>
                    <span>שם</span>
                    <span>צעדים</span>
                    <span>זמן</span>
                  </div>
                  {scores.map((row, index) => renderDaily(row, index + 1, row.id === highlightedId))}
                </div>
              ) : null}

              {boardOpen && pinBlocks.length > 0 ? (
                <div className="outside-top">
                  {pinBlocks.map((block) => (
                    block.kind === 'gap'
                      ? <p className="dots" aria-hidden="true" key={`gap-${block.rank}`}>···</p>
                      : renderDaily(block.row, block.rank, block.highlighted)
                  ))}
                </div>
              ) : null}

              {boardOpen && reasonerGiveUps.length > 0 ? (
                <div className="outside-top">
                  {reasonerGiveUps.map((row) => renderDaily(row, null, false))}
                </div>
              ) : null}

              {boardOpen && !loading && !error && scores.length === 0 && reasonerGiveUps.length === 0 ? (
                <p className="empty">עדיין אין תוצאות.</p>
              ) : null}

              {deviceDaily.length > 0 ? (
                <div className="device-scores">
                  <h3>במכשיר הזה</h3>
                  <div className="score-table">
                    {deviceDaily.map((row) => renderDaily(row, null, row.id === highlightId))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="free-board" aria-label="המשחקים החופשיים שלי">
              <h2>המשחקים החופשיים שלי</h2>
              {!loading && !error && freePlays.length === 0 ? (
                <p className="empty">עדיין אין משחקים חופשיים.</p>
              ) : null}
              {freePlays.length > 0 ? (
                <div className="score-table">
                  <div className="score-head free-main">
                    <span>תאריך</span>
                    <span>צעדים</span>
                    <span>זמן</span>
                  </div>
                  {freePlays.map((row) => {
                    const livePath = Array.isArray(row.fastestPath) ? null : fastestLive.paths[row.id];
                    const shown = Array.isArray(livePath) ? { ...row, fastestPath: livePath } : row;
                    const searching = !Array.isArray(shown.fastestPath)
                      && fastestLive.pendingIds.includes(row.id);
                    return (
                      <FreePlayRow
                        key={row.id}
                        row={shown}
                        searching={searching}
                        highlighted={highlightMode === 'free' && row.id === highlightId}
                        onShowPath={showPlayed}
                        onShowFastest={showFastest}
                        onReplay={replay}
                        allowReplay
                      />
                    );
                  })}
                </div>
              ) : null}
            </section>
          </div>
        </div>
        <div className="board-bar">
          <button className="primary" type="button" onClick={() => onHomeRef.current()}>
            משחק חדש
          </button>
        </div>
      </main>

      {pathView ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPathView(null)}>
          <div
            className="modal-card path-card"
            role="dialog"
            aria-modal="true"
            aria-label={pathHeading}
            tabIndex={-1}
            ref={pathDialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{pathHeading}</h2>
            {pathTitles.length > 0 ? (
              <>
                <PathLine
                  titles={pathTitles}
                  vias={(showingFastest || isWikiBot(pathRow)) ? hopNotes : []}
                />
                {(showingFastest || isWikiBot(pathRow)) && hopNotes === null ? (
                  <p className="status path-via-status">בודקים הפניות בדרך…</p>
                ) : null}
              </>
            ) : (
              <p className="lede">
                {showingFastest ? 'לא נמצאה דרך עד 25 דפים.' : 'הדרך לא נשמרה במשחק הזה.'}
              </p>
            )}
            <button className="primary" type="button" onClick={() => setPathView(null)}>סגור</button>
          </div>
        </div>
      ) : null}
    </Stage>
  );
}
