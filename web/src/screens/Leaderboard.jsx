import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDuration, timestampMillis } from '../time';

// Created while checking write access. Firestore rules allow create but not delete.
const IGNORED_SCORE_IDS = new Set([
  'Gxd5TIH6fiMMgK4qqznp',
  'WBwWbEGmFysvc440EjO8',
]);

function latestForUser(rows, uid) {
  if (!uid) return null;
  return rows.reduce((latest, row) => {
    if (row.uid !== uid) return latest;
    if (!latest || timestampMillis(row.timestamp) >= timestampMillis(latest.timestamp)) return row;
    return latest;
  }, null);
}

export default function Leaderboard({ user, highlightId, onHome }) {
  const [scores, setScores] = useState([]);
  const [playerScore, setPlayerScore] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const snapshot = await getDocs(collection(db, 'scores'));
        const rows = snapshot.docs
          .filter((entry) => !IGNORED_SCORE_IDS.has(entry.id))
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .filter((row) => typeof row.name === 'string' && row.name.trim());

        rows.sort((a, b) => {
          const pages = Number(a.pagesVisited) - Number(b.pagesVisited);
          if (pages) return pages;
          const time = Number(a.timeTaken) - Number(b.timeTaken);
          if (time) return time;
          return timestampMillis(a.timestamp) - timestampMillis(b.timestamp);
        });

        if (cancelled) return;

        const top = rows.slice(0, 10);
        const uid = user?.uid || '';
        let mine = null;
        if (highlightId && uid) {
          const highlighted = rows.find((row) => row.id === highlightId && row.uid === uid);
          if (highlighted) mine = highlighted;
        }
        if (!mine) mine = latestForUser(rows, uid);

        setScores(top);
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
  }, [highlightId, user]);

  const highlightedId = playerScore?.id;

  return (
    <main className="board">
      <h1>טבלת השיאים</h1>
      <p className="lede">הדירוג לפי מספר הצעדים, ואחר כך לפי הזמן.</p>

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
            <div
              className={row.id === highlightedId ? 'score-row is-player' : 'score-row'}
              key={row.id}
            >
              <span className="num">{index + 1}</span>
              <span className="name">{row.name}</span>
              <span className="num" dir="ltr">{row.pagesVisited}</span>
              <span className="num"><bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi></span>
            </div>
          ))}
        </div>
      ) : null}

      {playerRank > 10 && playerScore ? (
        <div className="outside-top">
          <p className="dots">.</p>
          <p className="dots">.</p>
          <p className="dots">.</p>
          <div className="score-row is-player">
            <span className="num">{playerRank}</span>
            <span className="name">{playerScore.name}</span>
            <span className="num" dir="ltr">{playerScore.pagesVisited}</span>
            <span className="num"><bdi className="clock" dir="ltr">{formatDuration(playerScore.timeTaken)}</bdi></span>
          </div>
        </div>
      ) : null}

      <button className="primary board-home" type="button" onClick={() => onHomeRef.current()}>
        {user ? 'משחק חדש' : 'חזרה'}
      </button>
    </main>
  );
}
