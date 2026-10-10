import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { accountName, authErrorMessage } from '../account';
import { enterFullscreen } from '../fullscreen';
import { auth, db } from '../firebase';
import { formatDuration, timestampMillis } from '../time';

const LEDE = 'כל יום מתחילים בערך פופולרי אחר, ומגיעים לערך המטרה רק דרך קישורים בתוך ויקיפדיה. בלי חיפוש ובלי קישורים החוצה. פחות צעדים מנצח, ובשוויון — הזמן הקצר יותר.';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatScoreDate(stamp) {
  const millis = timestampMillis(stamp);
  if (!millis) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(millis));
}

async function loadPersonalScores(uid) {
  const rowsFrom = (snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  try {
    const snapshot = await getDocs(query(collection(db, 'scores'), where('uid', '==', uid)));
    return rowsFrom(snapshot);
  } catch (error) {
    console.error(error);
    const snapshot = await getDocs(collection(db, 'scores'));
    return rowsFrom(snapshot).filter((row) => row.uid === uid);
  }
}

export default function HomeScreen({ user, redirectError, onStart, onLeaderboard }) {
  const [mode, setMode] = useState('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(redirectError || '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [overrideName, setOverrideName] = useState('');
  const [namedUid, setNamedUid] = useState('');
  const [myScores, setMyScores] = useState([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresError, setScoresError] = useState('');

  useEffect(() => {
    if (redirectError) setError(redirectError);
  }, [redirectError]);

  useEffect(() => {
    if (!user) {
      setMyScores([]);
      setScoresError('');
      setScoresLoading(false);
      return undefined;
    }

    let cancelled = false;
    setScoresLoading(true);
    setScoresError('');
    loadPersonalScores(user.uid)
      .then((rows) => {
        if (cancelled) return;
        rows.sort((a, b) => timestampMillis(b) - timestampMillis(a));
        setMyScores(rows);
      })
      .catch((loadError) => {
        console.error(loadError);
        if (!cancelled) setScoresError('לא הצלחנו לטעון את התוצאות שלך.');
      })
      .finally(() => {
        if (!cancelled) setScoresLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
  }

  function startGame() {
    enterFullscreen();
    onStart();
  }

  async function submitSignIn(event) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setError('יש להזין אימייל.');
      return;
    }
    if (!validEmail(nextEmail)) {
      setError('כתובת האימייל אינה תקינה.');
      return;
    }
    if (!password) {
      setError('יש להזין סיסמה.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await signInWithEmailAndPassword(auth, nextEmail, password);
    } catch (signInError) {
      console.error(signInError);
      setError(authErrorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp(event) {
    event.preventDefault();
    const name = displayName.trim();
    const nextEmail = email.trim();
    if (!name) {
      setError('יש להזין שם לתצוגה.');
      return;
    }
    if (!nextEmail) {
      setError('יש להזין אימייל.');
      return;
    }
    if (!validEmail(nextEmail)) {
      setError('כתובת האימייל אינה תקינה.');
      return;
    }
    if (password.length < 6) {
      setError(password ? 'הסיסמה קצרה מדי. נדרשים לפחות 6 תווים.' : 'יש להזין סיסמה.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const credential = await createUserWithEmailAndPassword(auth, nextEmail, password);
      await updateProfile(credential.user, { displayName: name });
      setNamedUid(credential.user.uid);
      setOverrideName(name);
    } catch (signUpError) {
      console.error(signUpError);
      setError(authErrorMessage(signUpError));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setError('יש להזין אימייל.');
      return;
    }
    if (!validEmail(nextEmail)) {
      setError('כתובת האימייל אינה תקינה.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendPasswordResetEmail(auth, nextEmail);
      setNotice('נשלח קישור לאיפוס הסיסמה.');
    } catch (resetError) {
      console.error(resetError);
      setError(authErrorMessage(resetError, 'לא הצלחנו לשלוח קישור לאיפוס. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError('');
    setNotice('');
    const provider = new GoogleAuthProvider();
    const popupFallback = new Set([
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
    ]);
    try {
      await signInWithPopup(auth, provider);
    } catch (popupError) {
      if (popupError?.code === 'auth/popup-closed-by-user' || popupError?.code === 'auth/cancelled-popup-request') {
        return;
      }
      if (!popupFallback.has(popupError?.code)) {
        console.error(popupError);
        setError(authErrorMessage(popupError));
        return;
      }
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error(redirectError);
        setError(authErrorMessage(redirectError));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError('');
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error(signOutError);
      setError('ההתנתקות נכשלה. נסו שוב.');
    }
  }

  const greeting = user?.displayName?.trim()
    || (user?.uid === namedUid ? overrideName : '')
    || accountName(user);

  return (
    <main className="screen">
      <div className="card">
        <h1>ברוכים הבאים למשחק הוויקיפדיה!</h1>
        <p className="lede">{LEDE}</p>

        {user ? (
          <>
            <p className="greeting">שלום, {greeting}</p>
            <button className="primary" type="button" onClick={startGame}>התחל</button>
            <div className="action-list">
              <button className="text-button" type="button" onClick={onLeaderboard}>
                טבלת השיאים
              </button>
              <button className="text-button danger" type="button" onClick={handleSignOut}>
                התנתקות
              </button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <section className="my-scores" aria-label="התוצאות שלי">
              <h2>התוצאות שלי</h2>
              {scoresLoading ? <p className="status">טוען תוצאות…</p> : null}
              {scoresError ? <p className="form-error" role="alert">{scoresError}</p> : null}
              {!scoresLoading && !scoresError && myScores.length === 0 ? (
                <p className="status">עדיין אין תוצאות.</p>
              ) : null}
              {myScores.map((row) => (
                <div className="my-score" key={row.id}>
                  <span>{formatScoreDate(row.timestamp)}</span>
                  <span><bdi dir="ltr">{row.pagesVisited}</bdi> צעדים</span>
                  <bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi>
                </div>
              ))}
            </section>
          </>
        ) : (
          <>
            {mode === 'reset' ? (
              <form onSubmit={submitReset} noValidate>
                <label htmlFor="reset-email">אימייל</label>
                <input
                  id="reset-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                />
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                {notice ? <p className="form-note">{notice}</p> : null}
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? 'שולח…' : 'שליחת קישור לאיפוס'}
                </button>
              </form>
            ) : (
              <form onSubmit={mode === 'sign-up' ? submitSignUp : submitSignIn} noValidate>
                {mode === 'sign-up' ? (
                  <>
                    <label htmlFor="display-name">שם לתצוגה</label>
                    <input
                      id="display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="nickname"
                      maxLength={40}
                      disabled={busy}
                    />
                  </>
                ) : null}
                <label htmlFor="account-email">אימייל</label>
                <input
                  id="account-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                />
                <label htmlFor="account-password">סיסמה</label>
                <input
                  id="account-password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  disabled={busy}
                />
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <button className="primary" type="submit" disabled={busy}>
                  {mode === 'sign-up' ? 'יצירת חשבון' : 'התחברות'}
                </button>
              </form>
            )}

            {mode !== 'reset' ? (
              <button className="secondary" type="button" onClick={continueWithGoogle} disabled={busy}>
                התחברות עם Google
              </button>
            ) : null}

            <div className="action-list">
              {mode === 'sign-in' ? (
                <>
                  <button className="text-button" type="button" onClick={() => switchMode('sign-up')}>
                    יצירת חשבון
                  </button>
                  <button className="text-button" type="button" onClick={() => switchMode('reset')}>
                    שכחתי סיסמה
                  </button>
                </>
              ) : null}
              {mode === 'sign-up' ? (
                <button className="text-button" type="button" onClick={() => switchMode('sign-in')}>
                  כבר יש לי חשבון
                </button>
              ) : null}
              {mode === 'reset' ? (
                <button className="text-button" type="button" onClick={() => switchMode('sign-in')}>
                  חזרה להתחברות
                </button>
              ) : null}
              <button className="text-button" type="button" onClick={onLeaderboard}>
                טבלת השיאים
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
