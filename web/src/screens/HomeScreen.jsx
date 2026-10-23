import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { accountName, authErrorMessage, publicName } from '../account';
import { NICKNAME_TAKEN, cleanNickname, nicknameAvailable, nicknameProblem, savePendingNickname } from '../nickname';
import { enterFullscreen } from '../fullscreen';
import { auth, db } from '../firebase';
import { loadLocalScores } from '../localScores';
import Stage from '../Stage';
import IntroAlert, { claimIntroThisSession, introSeen, markIntroSeen, skipIntroThisSession } from './IntroAlert';
import Tutorial, { isFirstAppOpen, markTutorialSeen } from './Tutorial';
import { useTheme } from '../ThemeButton';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function dailyScores(rows) {
  return rows
    .filter((row) => row.mode !== 'free')
    .sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
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

export default function HomeScreen({ user, redirectError, onStart, onFreePlay, onLeaderboard, onDesk }) {
  const theme = useTheme();
  const [mode, setMode] = useState('sign-in');
  const [mailOpen, setMailOpen] = useState(false);
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
  const [tutorialOpen, setTutorialOpen] = useState(isFirstAppOpen);
  const [showIntro, setShowIntro] = useState(() => {
    if (isFirstAppOpen()) {
      skipIntroThisSession();
      return false;
    }
    return claimIntroThisSession(Boolean(user) && introSeen());
  });
  const dismissIntro = useCallback((hideForever) => {
    if (hideForever) markIntroSeen();
    setShowIntro(false);
  }, []);
  const closeTutorial = useCallback(() => {
    markTutorialSeen();
    setTutorialOpen(false);
  }, []);

  useEffect(() => {
    if (redirectError) setError(redirectError);
  }, [redirectError]);

  useEffect(() => {
    const localDaily = dailyScores(loadLocalScores());
    if (!user) {
      setMyScores(localDaily);
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
        const seen = new Set();
        const merged = [...dailyScores(rows), ...localDaily].filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
        merged.sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
        setMyScores(merged);
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

  function openMail() {
    setMailOpen(true);
    switchMode('sign-in');
  }

  function closeMail() {
    setMailOpen(false);
    switchMode('sign-in');
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
    const nameProblem = nicknameProblem(name);
    if (nameProblem) {
      setError(nameProblem);
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
      if (!(await nicknameAvailable(name))) {
        setError(NICKNAME_TAKEN);
        return;
      }
      savePendingNickname(name);
      const credential = await createUserWithEmailAndPassword(auth, nextEmail, password);
      await updateProfile(credential.user, { displayName: cleanNickname(name) });
      try {
        await sendEmailVerification(credential.user);
      } catch (sendError) {
        console.error(sendError);
      }
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

  const greeting = publicName(
    user?.displayName?.trim() || (user?.uid === namedUid ? overrideName : ''),
    '',
  ) || accountName(user);

  const logoSrc = theme === 'dark' ? '/wikiwiki-logo-dark.png' : '/wikiwiki-logo.png';

  return (
    <Stage className="stage-home">
      <button className="how-to-play" type="button" onClick={() => setTutorialOpen(true)}>
        איך משחקים?
      </button>
      <main className="home-page">
        <header className="home-hero">
          <h1 className="home-title">
            <img
              className="home-logo rise"
              src={logoSrc}
              alt="WikiWiki"
              width={1400}
              height={1144}
            />
          </h1>
        </header>
        <section className="home-actions" aria-label="התחלה">
          {user ? <h2 className="greeting">שלום, {greeting}</h2> : null}
          <button className="primary" type="button" onClick={startGame}>שחק משחק יומי</button>
          <button className="secondary" type="button" onClick={startFreePlay}>משחק חופשי</button>
          <button className="text-button home-board-link" type="button" onClick={onLeaderboard}>
            תוצאות
          </button>
          {onDesk ? (
            <button className="text-button home-board-link" type="button" onClick={onDesk}>
              ניהול המשחק
            </button>
          ) : null}
          <div className="home-more">
            {user ? (
              <>
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <section className="my-scores" aria-label="התוצאה היומית שלי">
                  <h3>התוצאה היומית שלי</h3>
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
                {myScores.length > 0 ? (
                  <section className="my-scores" aria-label="התוצאה היומית שלי">
                    <h3>התוצאה היומית שלי</h3>
                    <div className="score-list">
                      {myScores.map((row) => (
                        <div className="my-score" key={row.id}>
                          <span>{formatScoreDate(row.timestamp)}</span>
                          <span><bdi dir="ltr">{row.pagesVisited}</bdi> צעדים</span>
                          <bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {mailOpen ? (
                  mode === 'reset' ? (
                    <div className="mail-form">
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
                    </div>
                  ) : (
                    <div className="mail-form">
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
                            <label htmlFor="display-name">כינוי</label>
                            <input
                              id="display-name"
                              value={displayName}
                              onChange={(event) => setDisplayName(event.target.value)}
                              autoComplete="nickname"
                              maxLength={24}
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
                        <button className="text-button" type="button" onClick={closeMail}>
                          חזרה
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="account-actions">
                    <button className="secondary google auth-choice" type="button" onClick={continueWithGoogle} disabled={busy}>
                      <span className="google-mark" aria-hidden="true">G</span>
                      התחברות או הרשמה עם Google
                    </button>
                    <button className="secondary auth-choice" type="button" onClick={openMail} disabled={busy}>
                      התחברות או הרשמה עם אימייל
                    </button>
                    {error ? <p className="form-error" role="alert">{error}</p> : null}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <IntroAlert open={showIntro && !tutorialOpen} rememberable={Boolean(user)} onDismiss={dismissIntro} />
      {tutorialOpen ? <Tutorial onClose={closeTutorial} /> : null}
    </Stage>
  );
}
