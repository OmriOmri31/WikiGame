import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { enterFullscreen } from '../fullscreen';
import { db } from '../firebase';
import { loadLocalScores } from '../localScores';
import Stage from '../Stage';
import ThemeButton from '../ThemeButton';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';
import { subscribeBot } from '../botRun';
import { isReasoner, REASONER_NAME } from '../reasonerBot';
import { isWikiBot, WIKI_BOT_NAME } from '../wikiBot';
import { articleUrl, normalizeTitle } from '../wikipedia';

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

function DailyRow({ row, rank, highlighted, onShowPath, onReplay, allowReplay, showPath }) {
  return (
    <div
      id={`score-${row.id}`}
      className={['score-row', highlighted ? 'is-player' : '', isWikiBot(row) ? 'is-fastest' : '', isReasoner(row) ? 'is-reasoner' : ''].filter(Boolean).join(' ')}
    >
      <div className="score-main">
        <span className={Number.isInteger(rank) && rank <= 3 ? 'num is-medal' : 'num'}>{rank ?? '—'}</span>
        <span className="name">
          {isWikiBot(row) ? WIKI_BOT_NAME : isReasoner(row) ? REASONER_NAME : row.name}
          {row.gaveUp ? <span className="give-up-mark">ויתור</span> : null}
        </span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num"><bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi></span>
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

function FreePlayRow({ row, highlighted, onShowPath, onShowFastest, onReplay, allowReplay }) {
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

function PathLine({ titles }) {
  return (
    <p className="path-line" dir="rtl">
      {titles.map((title, index) => (
        <span className="path-step" key={`${title}-${index}`}>
          {index > 0 ? <span className="path-sep" aria-hidden="true">←</span> : null}
          <a href={articleUrl(title)} target="_blank" rel="noopener noreferrer">
            <bdi>{title}</bdi>
          </a>
        </span>
      ))}
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
  const [outsideBots, setOutsideBots] = useState([]);
  const [reasonerGiveUps, setReasonerGiveUps] = useState([]);
  const [wonKeys, setWonKeys] = useState(() => new Set());
  const [botPhase, setBotPhase] = useState('idle');
  const [reloadToken, setReloadToken] = useState(0);
  const [pathView, setPathView] = useState(null);
  const pathDialogRef = useRef(null);
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

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

      const rows = readable.filter((row) => (
        row.mode !== 'free'
        && !row.gaveUp
        && !row.lock
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

      const top = rows.slice(0, 10);
      let mine = null;
      if (highlightMode !== 'free' && highlightId && uid) {
        const highlighted = rows.find((row) => row.id === highlightId && row.uid === uid);
        if (highlighted) mine = highlighted;
      }
      if (!mine) mine = latestForUser(rows, uid);

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
      setOutsideBots(rows.flatMap((row, index) => (
        (isWikiBot(row) || isReasoner(row)) && index >= 10 ? [{ row, rank: index + 1 }] : []
      )));
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
      setPlayerRank(mine ? rows.findIndex((row) => row.id === mine.id) + 1 : null);
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

  const highlightedId = playerScore?.id;
  const pathRow = pathView?.row || null;
  const showingFastest = pathView?.kind === 'fastest';
  const pathTitles = showingFastest ? (fastestPath(pathRow) || []) : savedPath(pathRow);
  const outsideRows = [
    ...(playerRank > 10 && playerScore ? [{ row: playerScore, rank: playerRank, highlighted: true }] : []),
    ...outsideBots
      .filter((item) => item.row.id !== playerScore?.id)
      .map((item) => ({ ...item, highlighted: false })),
    ...reasonerGiveUps.map((row) => ({ row, rank: null, highlighted: false })),
  ].sort((a, b) => {
    if (a.rank == null && b.rank == null) return timestampMillis(b.row.timestamp) - timestampMillis(a.row.timestamp);
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });

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

              {!loading && !error && scores.length === 0 ? (
                <p className="empty">עדיין אין תוצאות.</p>
              ) : null}
              {botPhase === 'running' ? <p className="status">מחפשים את הדרך המהירה ביותר…</p> : null}

              {scores.length > 0 ? (
                <div className="score-table">
                  <div className="score-head">
                    <span>מקום</span>
                    <span>שם</span>
                    <span>צעדים</span>
                    <span>זמן</span>
                  </div>
                  {scores.map((row, index) => (
                    <DailyRow
                      key={row.id}
                      row={row}
                      rank={index + 1}
                      highlighted={row.id === highlightedId}
                      onShowPath={showPlayed}
                      onReplay={replay}
                      allowReplay
                      showPath={showDailyPath(row)}
                    />
                  ))}
                </div>
              ) : null}

              {deviceDaily.length > 0 ? (
                <div className="device-scores">
                  <h3>במכשיר הזה</h3>
                  <div className="score-table">
                    {deviceDaily.map((row) => (
                      <DailyRow
                        key={row.id}
                        row={row}
                        rank={null}
                        highlighted={row.id === highlightId}
                        onShowPath={showPlayed}
                        onReplay={replay}
                        allowReplay
                        showPath={showDailyPath(row)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {outsideRows.length > 0 ? (
                <div className="outside-top">
                  <p className="dots" aria-hidden="true">···</p>
                  {outsideRows.map((item) => (
                    <DailyRow
                      key={item.row.id}
                      row={item.row}
                      rank={item.rank}
                      highlighted={item.highlighted}
                      onShowPath={showPlayed}
                      onReplay={replay}
                      allowReplay
                      showPath={showDailyPath(item.row)}
                    />
                  ))}
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
                  {freePlays.map((row) => (
                    <FreePlayRow
                      key={row.id}
                      row={row}
                      highlighted={highlightMode === 'free' && row.id === highlightId}
                      onShowPath={showPlayed}
                      onShowFastest={showFastest}
                      onReplay={replay}
                      allowReplay
                    />
                  ))}
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
            aria-label={showingFastest ? WIKI_BOT_NAME : 'הדרך'}
            tabIndex={-1}
            ref={pathDialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{showingFastest ? WIKI_BOT_NAME : 'הדרך'}</h2>
            {pathTitles.length > 0 ? (
              <PathLine titles={pathTitles} />
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
