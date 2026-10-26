/* global __WIKIGAME_TEST__ */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ADMIN_UID, isAdmin as isOwnerAdmin } from './admin';
import { auth, redirectResult } from './firebase';
import { authErrorMessage } from './account';
import { rememberLinkFromError } from './linking';
import { claimGuestResult } from './guestClaim';
import { loadProfile, needsEmailVerification, pendingNickname } from './nickname';
import { KeepNicknameScreen, NicknameScreen, VerifyEmailScreen } from './screens/AccountGate';
import { exitFullscreen } from './fullscreen';
import { clearGameSession, loadGameSession } from './gameSession';
import { isTestAdmin, onTestDeskPage, pageTitle } from './testSite';
import Stage from './Stage';
import { skipIntroThisSession } from './screens/IntroAlert';
import { INFO_PAGES, infoPageFromPath } from './legal';

// The owner, or on the test site only, the test admin.
function isAdmin(user) {
  return isOwnerAdmin(user) || isTestAdmin(user);
}
import HomeScreen from './screens/HomeScreen';

// Heavy screens load on demand so the home page opens fast.
const GameScreen = lazy(() => import('./screens/GameScreen'));
const Leaderboard = lazy(() => import('./screens/Leaderboard'));
const AdminScreen = lazy(() => import('./screens/AdminScreen'));
const InfoPage = lazy(() => import('./screens/InfoPage'));

function deskPath() {
  return window.location.pathname === '/admin' || onTestDeskPage();
}

function resumedMatch(session) {
  if (!session) return { mode: 'daily', pair: null, id: 0, resume: null };
  return {
    mode: session.mode,
    pair: { startTitle: session.startTitle, goalTitle: session.goalTitle },
    id: 1,
    resume: session,
  };
}

function Loading() {
  return (
    <Stage>
      <main className="stage-status">
        <p className="status">טוען…</p>
      </main>
    </Stage>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <AppScreens />
    </Suspense>
  );
}

function AppScreens() {
  const [screen, setScreen] = useState(() => {
    if (deskPath()) {
      skipIntroThisSession();
      return 'admin';
    }
    if (infoPageFromPath()) return 'info';
    if (loadGameSession()) {
      skipIntroThisSession();
      return 'game';
    }
    return 'home';
  });
  const [infoPage, setInfoPage] = useState(() => infoPageFromPath());
  // Where "חזרה" on an info page leads: the leaderboard if it was opened from there, otherwise home
  // (or the saved game, when the page was opened straight from its address).
  const infoReturnRef = useRef(loadGameSession() ? 'game' : 'home');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [, setAuthVersion] = useState(0);
  const [profile, setProfile] = useState({ uid: '', data: null, ready: false });
  const [result, setResult] = useState(null);
  const [match, setMatch] = useState(() => (
    deskPath() ? { mode: 'daily', pair: null, id: 0, resume: null } : resumedMatch(loadGameSession())
  ));

  function beginGame(next) {
    clearGameSession();
    const nextPair = next.pair?.startTitle && next.pair?.goalTitle ? next.pair : null;
    const mode = next.mode === 'free' || next.mode === 'preview' ? next.mode : 'daily';
    setResult(null);
    setMatch({
      mode,
      pair: nextPair,
      id: Date.now(),
      resume: null,
    });
    setScreen('game');
  }

  useEffect(() => {
    if (screen === 'info' && INFO_PAGES[infoPage]) {
      document.title = pageTitle(`${INFO_PAGES[infoPage].title} – משחק הוויקיפדיה`);
      return;
    }
    document.title = pageTitle(screen === 'admin' ? 'ניהול המשחק' : 'משחק הוויקיפדיה');
  }, [screen, infoPage]);

  useEffect(() => {
    const onPop = () => {
      const page = infoPageFromPath();
      if (page) setInfoPage(page);
      setScreen((current) => {
        if (deskPath()) return 'admin';
        if (page) return 'info';
        if (current === 'info') return infoReturnRef.current;
        if (current === 'admin') return 'home';
        return current;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function openDesk() {
    window.history.pushState({ desk: true }, '', '/admin');
    setScreen('admin');
  }

  function openInfo(page) {
    if (!INFO_PAGES[page]) return;
    const depth = screen === 'info' ? (window.history.state?.infoDepth || 0) + 1 : 1;
    if (screen !== 'info') infoReturnRef.current = screen === 'leaderboard' ? 'leaderboard' : 'home';
    window.history.pushState({ info: page, infoDepth: depth }, '', INFO_PAGES[page].path);
    setInfoPage(page);
    setScreen('info');
  }

  function closeInfo() {
    const depth = window.history.state?.infoDepth;
    if (depth) {
      window.history.go(-depth);
      return;
    }
    window.history.replaceState(null, '', '/');
    const back = infoReturnRef.current;
    setScreen(back === 'game' && !loadGameSession() ? 'home' : back);
  }

  function closeDesk() {
    if (window.history.state?.desk) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', '/');
    setScreen('home');
  }

  // The test site's unlisted queue page is open to any account (see testSite.js), and is kept out
  // of search engines.
  useEffect(() => {
    if (!__WIKIGAME_TEST__ || !onTestDeskPage()) return undefined;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!authReady || !user || isAdmin(user) || onTestDeskPage()) return;
    if (screen !== 'admin' && !deskPath()) return;
    if (!ADMIN_UID) console.warn('Set ADMIN_UID in web/src/admin.js to open the desk.');
    window.history.replaceState(null, '', '/');
    setScreen('home');
  }, [authReady, user, screen]);

  useEffect(() => {
    if (screen !== 'game') exitFullscreen();
  }, [screen]);

  useEffect(() => {
    let active = true;
    redirectResult.catch((error) => {
      console.error(error);
      if (rememberLinkFromError(error)) {
        if (active) setAuthNotice('link');
        return;
      }
      if (active) setAuthNotice(authErrorMessage(error));
    });
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setProfile({ uid: '', data: null, ready: false });
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || needsEmailVerification(user) || profile.uid === user.uid) return undefined;
    let cancelled = false;
    loadProfile(user.uid)
      .then((data) => { if (!cancelled) setProfile({ uid: user.uid, data, ready: true }); })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setProfile({ uid: user.uid, data: null, ready: true, error: true });
      });
    return () => { cancelled = true; };
  });

  // Once the player is signed in, verified and named, move a pending guest result to the account.
  const accountReady = Boolean(user && !needsEmailVerification(user) && profile.uid === user?.uid
    && profile.data?.nickname && (user.displayName || '') === profile.data.nickname);
  useEffect(() => {
    if (!accountReady) return;
    claimGuestResult(user, profile.data.nickname).catch((error) => console.error(error));
  }, [accountReady, user, profile.data?.nickname]);

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    if (current.emailVerified) await current.getIdToken(true);
    setAuthVersion((value) => value + 1);
    return current.emailVerified;
  }, []);

  // The info pages are open to everyone, before any account step.
  if (screen === 'info') {
    return <InfoPage page={infoPage} onBack={closeInfo} onOpen={openInfo} />;
  }

  // Account gate: email accounts must verify, and every account needs a unique nickname.
  if (screen !== 'admin' && authReady && user) {
    if (needsEmailVerification(user)) {
      return <VerifyEmailScreen user={user} onRefresh={refreshUser} />;
    }
    if (profile.uid !== user.uid || !profile.ready) {
      return (
        <Stage>
          <main className="stage-status">
            <p className="status">טוען…</p>
          </main>
        </Stage>
      );
    }
    if (!profile.data?.nickname && !profile.error) {
      const pending = pendingNickname();
      return (
        <NicknameScreen
          key={user.uid}
          user={user}
          suggested={pending}
          autoClaim={Boolean(pending)}
          onDone={(data) => setProfile({ uid: user.uid, data, ready: true })}
        />
      );
    }
    // Google sign-in replaces the auth display name with the Google name. The saved nickname wins
    // unless the player chooses a new one.
    if (profile.data?.nickname && (user.displayName || '') !== profile.data.nickname) {
      return (
        <KeepNicknameScreen
          key={`keep-${user.uid}`}
          user={user}
          nickname={profile.data.nickname}
          onDone={(data) => setProfile({ uid: user.uid, data, ready: true })}
        />
      );
    }
  }

  if (screen === 'game') {
    return (
      <GameScreen
        key={match.id}
        user={user}
        mode={match.mode}
        pair={match.pair}
        resume={match.resume}
        onFinish={(score) => {
          if (match.mode === 'preview') {
            setScreen('admin');
            return;
          }
          setResult(score);
          setScreen('leaderboard');
        }}
        onExit={() => {
          setResult(null);
          setScreen(match.mode === 'preview' ? 'admin' : 'home');
        }}
      />
    );
  }

  if (screen === 'leaderboard') {
    return (
      <Leaderboard
        user={user}
        highlightId={result?.id || ''}
        highlightMode={result?.mode || ''}
        onHome={() => setScreen('home')}
        onSignIn={() => setScreen('home')}
        onOpenPage={openInfo}
        onPlayAgain={(row) => beginGame({
          mode: row.mode === 'free' ? 'free' : 'daily',
          pair: { startTitle: row.startTitle, goalTitle: row.goalTitle },
        })}
      />
    );
  }

  if (screen === 'admin') {
    if (!authReady || (user && !isAdmin(user) && !onTestDeskPage())) {
      return (
        <Stage>
          <main className="stage-status">
            <p className="status">טוען…</p>
          </main>
        </Stage>
      );
    }
    return (
      <AdminScreen
        user={user}
        onPlay={(pair) => beginGame({ mode: 'preview', pair })}
        onBack={closeDesk}
      />
    );
  }

  if (!authReady) {
    return (
      <Stage>
        <main className="stage-status">
          <p className="status">טוען…</p>
        </main>
      </Stage>
    );
  }

  return (
    <HomeScreen
      user={user}
      redirectError={authNotice}
      onStart={() => beginGame({ mode: 'daily' })}
      onFreePlay={() => beginGame({ mode: 'free' })}
      onLeaderboard={() => setScreen('leaderboard')}
      onDesk={isAdmin(user) ? openDesk : null}
      onOpenPage={openInfo}
    />
  );
}
