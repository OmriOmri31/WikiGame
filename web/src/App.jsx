import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { startDailyBot } from './botRun';
import { auth, redirectResult } from './firebase';
import { authErrorMessage } from './account';
import { exitFullscreen } from './fullscreen';
import Stage from './Stage';
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import GameScreen from './screens/GameScreen';
import Leaderboard from './screens/Leaderboard';

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [result, setResult] = useState(null);
  const [match, setMatch] = useState({ mode: 'daily', pair: null, id: 0 });
  const showHome = useCallback(() => setScreen('home'), []);

  function beginGame(next) {
    const nextPair = next.pair?.startTitle && next.pair?.goalTitle ? next.pair : null;
    setResult(null);
    setMatch({
      mode: next.mode === 'free' ? 'free' : 'daily',
      pair: nextPair,
      id: Date.now(),
    });
    setScreen('game');
  }

  useEffect(() => {
    document.title = 'משחק הוויקיפדיה';
  }, [screen]);

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
        onFinish={(score) => {
          setResult(score);
          setScreen('leaderboard');
        }}
        onExit={() => {
          setResult(null);
          setScreen('home');
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
      onCustomGame={(id) => {
        setResult({ id, mode: 'free' });
        setScreen('leaderboard');
      }}
    />
  );
}
