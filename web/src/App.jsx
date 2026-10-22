import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ADMIN_UID, isAdmin } from './admin';
import { startDailyBot } from './botRun';
import { auth, redirectResult } from './firebase';
import { authErrorMessage } from './account';
import { exitFullscreen } from './fullscreen';
import { clearGameSession, loadGameSession } from './gameSession';
import Stage from './Stage';
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import GameScreen from './screens/GameScreen';
import Leaderboard from './screens/Leaderboard';
import AdminScreen from './screens/AdminScreen';

function deskPath() {
  return window.location.pathname === '/admin';
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

export default function App() {
  const [screen, setScreen] = useState(() => {
    if (deskPath()) return 'admin';
    return loadGameSession() ? 'game' : 'splash';
  });
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [result, setResult] = useState(null);
  const [match, setMatch] = useState(() => (
    deskPath() ? { mode: 'daily', pair: null, id: 0, resume: null } : resumedMatch(loadGameSession())
  ));
  const showHome = useCallback(() => setScreen('home'), []);

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
    document.title = screen === 'admin' ? 'ניהול המשחק' : 'משחק הוויקיפדיה';
  }, [screen]);

  useEffect(() => {
    const onPop = () => {
      setScreen((current) => {
        if (deskPath()) return 'admin';
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

  function closeDesk() {
    if (window.history.state?.desk) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', '/');
    setScreen('home');
  }

  useEffect(() => {
    if (!authReady || !user || isAdmin(user)) return;
    if (screen !== 'admin' && !deskPath()) return;
    if (!ADMIN_UID) console.warn('Set ADMIN_UID in web/src/admin.js to open the desk.');
    window.history.replaceState(null, '', '/');
    setScreen('home');
  }, [authReady, user, screen]);

  useEffect(() => startDailyBot(), []);

  useEffect(() => {
    if (screen !== 'game') exitFullscreen();
  }, [screen]);

  useEffect(() => {
    let active = true;
    redirectResult.catch((error) => {
      console.error(error);
      if (active) setAuthNotice(authErrorMessage(error));
    });
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (screen === 'splash') {
    return <SplashScreen onDone={showHome} />;
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
        onPlayAgain={(row) => beginGame({
          mode: row.mode === 'free' ? 'free' : 'daily',
          pair: { startTitle: row.startTitle, goalTitle: row.goalTitle },
        })}
      />
    );
  }

  if (screen === 'admin') {
    if (!authReady || (user && !isAdmin(user))) {
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
    />
  );
}
