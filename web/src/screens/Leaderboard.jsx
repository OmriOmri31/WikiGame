import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { enterFullscreen } from '../fullscreen';
import { db } from '../firebase';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';
import { articleUrl, normalizeTitle } from '../wikipedia';

// Firestore rules allow create but not delete, so probe scores stay hidden here.
const IGNORED_SCORE_IDS = new Set([
  'Gxd5TIH6fiMMgK4qqznp',
  'WBwWbEGmFysvc440EjO8',
  'mXPsH85ZrHsQGW4OfskY',
  'GocwcHCAmyGj9QUz3OBf',
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

function canReplay(row) {
  return Boolean(normalizeTitle(row?.startTitle) && normalizeTitle(row?.goalTitle));
}

function ScoreActions({ row, onShowPath, onReplay, allowReplay }) {
  const replayReady = allowReplay && canReplay(row);
  return (
    <div className="score-actions">
      <button className="text-button compact" type="button" onClick={() => onShowPath(row)}>
        הצג דרך
      </button>
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

function DailyRow({ row, rank, highlighted, onShowPath, onReplay, allowReplay }) {
  return (
    <div
      id={`score-${row.id}`}
      className={highlighted ? 'score-row is-player' : 'score-row'}
    >
      <div className="score-main">
        <span className="num">{rank}</span>
        <span className="name">{row.name}</span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num"><bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi></span>
      </div>
      <ScoreActions row={row} onShowPath={onShowPath} onReplay={onReplay} allowReplay={allowReplay} />
    </div>
  );
}

function FreePlayRow({ row, highlighted, onShowPath, onReplay, allowReplay }) {
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
      </p>
      <ScoreActions row={row} onShowPath={onShowPath} onReplay={onReplay} allowReplay={allowReplay} />
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
  const [pathRow, setPathRow] = useState(null);
  const pathDialogRef = useRef(null);
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const snapshot = await getDocs(collection(db, 'scores'));
        const readable = snapshot.docs
          .filter((entry) => !IGNORED_SCORE_IDS.has(entry.id))
          .map((entry) => ({ id: entry.id, ...entry.data() }));

        const rows = readable.filter((row) => (
          row.mode !== 'free' && typeof row.name === 'string' && row.name.trim()
        ));

        rows.sort((a, b) => {
          const pages = Number(a.pagesVisited) - Number(b.pagesVisited);
          if (pages) return pages;
          const time = Number(a.timeTaken) - Number(b.timeTaken);
          if (time) return time;
          return timestampMillis(a.timestamp) - timestampMillis(b.timestamp);
        });

        const uid = user?.uid || '';
        const mineFree = readable
          .filter((row) => row.mode === 'free' && row.uid === uid)
          .sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));

        if (cancelled) return;

        const top = rows.slice(0, 10);
        let mine = null;
        if (highlightMode !== 'free' && highlightId && uid) {
          const highlighted = rows.find((row) => row.id === highlightId && row.uid === uid);
          if (highlighted) mine = highlighted;
        }
        if (!mine) mine = latestForUser(rows, uid);

        setScores(top);
        setFreePlays(mineFree);
        setPlayerScore(mine || null);
        setPlayerRank(mine ? rows.findIndex((row) => row.id === mine.id) + 1 : null);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError('לא הצלחנו לטעון את טבלת השיאים.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [highlightId, highlightMode, user]);

  useEffect(() => {
    if (loading || !highlightId) return undefined;
    document.getElementById(`score-${highlightId}`)?.scrollIntoView({ block: 'center' });
    return undefined;
  }, [highlightId, loading, scores, freePlays]);

  useEffect(() => {
    if (!pathRow) return undefined;
    pathDialogRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setPathRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathRow]);

  const highlightedId = playerScore?.id;
  const pathTitles = savedPath(pathRow);

  function replay(row) {
    if (!canReplay(row)) return;
    enterFullscreen();
    onPlayAgain(row);
  }

  return (
    <main className="board">
      <div className="board-scroll">
      <h1>טבלת השיאים</h1>
      <p className="lede">הדירוג לפי מספר הצעדים, ואחר כך לפי הזמן.</p>
      <h2>משחק יומי</h2>

      {loading ? <p className="status">טוען תוצאות…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!loading && !error && scores.length === 0 ? (
        <p className="status">עדיין אין תוצאות.</p>
      ) : null}

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
              onShowPath={setPathRow}
              onReplay={replay}
              allowReplay={Boolean(user)}
            />
          ))}
        </div>
      ) : null}

      {playerRank > 10 && playerScore ? (
        <div className="outside-top">
          <p className="dots" aria-hidden="true">···</p>
          <DailyRow
            row={playerScore}
            rank={playerRank}
            highlighted
            onShowPath={setPathRow}
            onReplay={replay}
            allowReplay={Boolean(user)}
          />
        </div>
      ) : null}

      <section className="free-board" aria-label="המשחקים החופשיים שלי">
        <h2>המשחקים החופשיים שלי</h2>
        {!user ? <p className="status">התחברו כדי לראות את המשחקים החופשיים שלכם.</p> : null}
        {user && !loading && !error && freePlays.length === 0 ? (
          <p className="status">עדיין אין משחקים חופשיים.</p>
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
                onShowPath={setPathRow}
                onReplay={replay}
                allowReplay={Boolean(user)}
              />
            ))}
          </div>
        ) : null}
      </section>

      </div>
      <div className="board-bar">
        <button className="primary" type="button" onClick={() => onHomeRef.current()}>
          {user ? 'משחק חדש' : 'חזרה'}
        </button>
      </div>

      {pathRow ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPathRow(null)}>
          <div
            className="modal-card path-card"
            role="dialog"
            aria-modal="true"
            aria-label="הדרך"
            tabIndex={-1}
            ref={pathDialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>הדרך</h2>
            {pathTitles.length > 0 ? (
              <PathLine titles={pathTitles} />
            ) : (
              <p className="lede">הדרך לא נשמרה במשחק הזה.</p>
            )}
            <button className="primary" type="button" onClick={() => setPathRow(null)}>סגור</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
