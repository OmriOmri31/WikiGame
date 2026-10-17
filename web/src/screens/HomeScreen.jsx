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
import Stage from '../Stage';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';

const STEPS = [
  {
    id: 'start',
    title: 'ערך פתיחה',
    body: 'כל יום מתחילים בערך פופולרי אחר.',
  },
  {
    id: 'links',
    title: 'רק קישורים',
    body: 'מגיעים לערך המטרה רק דרך קישורים בתוך ויקיפדיה. בלי חיפוש ובלי קישורים החוצה.',
  },
  {
    id: 'finish',
    title: 'ניצחון',
    body: 'פחות צעדים מנצח, ובשוויון — הזמן הקצר יותר.',
  },
];

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

export default function HomeScreen({ user, redirectError, onStart, onFreePlay, onLeaderboard }) {
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
  const [step, setStep] = useState('links');

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
        const dailyRows = rows.filter((row) => row.mode !== 'free');
        dailyRows.sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
        setMyScores(dailyRows);
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

  function startFreePlay() {
    enterFullscreen();
    onFreePlay();
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
    <Stage className="stage-home">
      <header className="stage-bar">
        <p className="wordmark">משחק <em>הוויקיפדיה</em></p>
        <button className="pill" type="button" onClick={onLeaderboard}>
          טבלת השיאים
        </button>
      </header>

      <main className="home-grid">
        <section className="story rise">
          <p className="kicker">משחק יומי</p>
          <h1>מגיעים לכל ערך, רק דרך קישורים.</h1>
          <p className="lede">
            כל יום מתחילים בערך פופולרי אחר, ומגיעים לערך המטרה בלי חיפוש ובלי לצאת מוויקיפדיה.
          </p>
          <div className="proof">
            {STEPS.map((item, index) => (
              <button
                key={item.id}
                className={step === item.id ? 'proof-step is-on' : 'proof-step'}
                type="button"
                aria-pressed={step === item.id}
                onClick={() => setStep(item.id)}
              >
                <span className="proof-index">{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </button>
            ))}
          </div>
          <p className="aside">במשחק החופשי כל סיבוב מקבל זוג ערכים אחר, בלי הגבלה.</p>
        </section>

        <section className="panel glass rise rise-late" aria-label={user ? 'התחלה' : 'חשבון'}>
          <div className="panel-scroll">
            {user ? (
              <>
                <p className="kicker">החשבון</p>
                <h2 className="greeting">שלום, {greeting}</h2>
                <button className="primary" type="button" onClick={startGame}>התחל משחק יומי</button>
                <button className="secondary" type="button" onClick={startFreePlay}>משחק חופשי</button>
                <p className="hint">כל סיבוב מקבל זוג ערכים אחר, בלי הגבלה.</p>
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <section className="my-scores" aria-label="התוצאות היומיות שלי">
                  <h3>התוצאות היומיות שלי</h3>
                  {scoresLoading ? <p className="status">טוען תוצאות…</p> : null}
                  {scoresError ? <p className="form-error" role="alert">{scoresError}</p> : null}
                  {!scoresLoading && !scoresError && myScores.length === 0 ? (
                    <p className="empty">עדיין אין תוצאות.</p>
                  ) : null}
                  {myScores.length > 0 ? (
                    <div className="score-list">
                      {myScores.map((row) => (
                        <div className="my-score" key={row.id}>
                          <span>{formatScoreDate(row.timestamp)}</span>
                          <span><bdi dir="ltr">{row.pagesVisited}</bdi> צעדים</span>
                          <bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
                <button className="text-button danger" type="button" onClick={handleSignOut}>
                  התנתקות
                </button>
              </>
            ) : (
              <>
                {mode === 'reset' ? (
                  <>
                    <p className="kicker">חשבון</p>
                    <h2>איפוס סיסמה</h2>
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
                    <div className="form-links">
                      <button className="text-button" type="button" onClick={() => switchMode('sign-in')}>
                        חזרה להתחברות
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={mode === 'sign-up' ? 'segment is-sign-up' : 'segment'} role="tablist" aria-label="סוג כניסה">
                      <span className="segment-thumb" aria-hidden="true" />
                      <button
                        id="tab-sign-in"
                        type="button"
                        role="tab"
                        aria-selected={mode === 'sign-in'}
                        aria-controls="account-panel"
                        onClick={() => switchMode('sign-in')}
                      >
                        התחברות
                      </button>
                      <button
                        id="tab-sign-up"
                        type="button"
                        role="tab"
                        aria-selected={mode === 'sign-up'}
                        aria-controls="account-panel"
                        onClick={() => switchMode('sign-up')}
                      >
                        חשבון חדש
                      </button>
                    </div>
                    <form
                      id="account-panel"
                      role="tabpanel"
                      aria-labelledby={mode === 'sign-up' ? 'tab-sign-up' : 'tab-sign-in'}
                      onSubmit={mode === 'sign-up' ? submitSignUp : submitSignIn}
                      noValidate
                    >
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
                        {busy ? 'רגע…' : (mode === 'sign-up' ? 'יצירת חשבון' : 'התחברות')}
                      </button>
                    </form>
                    <button className="secondary google" type="button" onClick={continueWithGoogle} disabled={busy}>
                      <span className="google-mark" aria-hidden="true">G</span>
                      התחברות עם Google
                    </button>
                    <div className="form-links">
                      {mode === 'sign-in' ? (
                        <button className="text-button" type="button" onClick={() => switchMode('reset')}>
                          שכחתי סיסמה
                        </button>
                      ) : (
                        <button className="text-button" type="button" onClick={() => switchMode('sign-in')}>
                          כבר יש לי חשבון
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </Stage>
  );
}
