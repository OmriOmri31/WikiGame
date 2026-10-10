import { useState } from 'react';

export default function HomeScreen({ initialName, onStart, onLeaderboard }) {
  const [playerName, setPlayerName] = useState(initialName);
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) {
      setError('אנא הכנס את שמך לפני תחילת המשחק.');
      return;
    }
    onStart(name);
  }

  return (
    <main className="screen">
      <form className="card" onSubmit={handleSubmit}>
        <h1>ברוכים הבאים למשחק הוויקיפדיה!</h1>
        <p className="lede">
          עברו מערך הפתיחה לערך המטרה דרך קישורים בתוך ויקיפדיה בלבד.
          פחות צעדים, ואחר כך פחות זמן, מעלים את הדירוג.
        </p>
        <label htmlFor="player-name">שם השחקן</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => {
            setPlayerName(event.target.value);
            if (error) setError('');
          }}
          placeholder="הכנס את שמך"
          maxLength={40}
          autoComplete="nickname"
          autoFocus
        />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary" type="submit">התחל</button>
        <button className="text-button" type="button" onClick={onLeaderboard}>
          טבלת השיאים
        </button>
      </form>
    </main>
  );
}
