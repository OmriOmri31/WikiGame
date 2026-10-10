import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Created while checking write access. Firestore rules allow create but not delete.
const IGNORED_SCORE_IDS = new Set(['Gxd5TIH6fiMMgK4qqznp']);

function millis(row) {
  const stamp = row.timestamp;
  if (!stamp) return 0;
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  return 0;
}

function formatTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(2);
}

export default function Leaderboard({ playerName, highlightId, onHome }) {
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
          return millis(a) - millis(b);
        });

        if (cancelled) return;

        const top = rows.slice(0, 10);
        let mine = highlightId ? rows.find((row) => row.id === highlightId) : null;
        if (!mine && playerName) {
          const own = rows.filter((row) => row.name === playerName);
          mine = own.reduce((latest, row) => {
            if (!latest || millis(row) >= millis(latest)) return row;
            return latest;
          }, null);
        }

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
  }, [highlightId, playerName]);

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
            <span>זמן (שניות)</span>
          </div>
          {scores.map((row, index) => (
            <div
              className={row.id === highlightedId ? 'score-row is-player' : 'score-row'}
              key={row.id}
            >
              <span className="num">{index + 1}</span>
              <span className="name">{row.name}</span>
              <span className="num" dir="ltr">{row.pagesVisited}</span>
              <span className="num" dir="ltr">{formatTime(row.timeTaken)}</span>
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
            <span className="num" dir="ltr">{formatTime(playerScore.timeTaken)}</span>
          </div>
        </div>
      ) : null}

      <button className="primary board-home" type="button" onClick={() => onHomeRef.current()}>
        {playerName ? 'משחק חדש' : 'חזרה'}
      </button>
    </main>
  );
}
