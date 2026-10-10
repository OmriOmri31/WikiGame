import { useEffect, useState } from 'react';
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import GameScreen from './screens/GameScreen';
import Leaderboard from './screens/Leaderboard';

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [playerName, setPlayerName] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    document.title = 'משחק הוויקיפדיה';
  }, [screen]);

  if (screen === 'splash') {
    return <SplashScreen onDone={() => setScreen('home')} />;
  }

  if (screen === 'home') {
    return (
      <HomeScreen
        initialName={playerName}
        onStart={(name) => {
          setPlayerName(name);
          setResult(null);
          setScreen('game');
        }}
        onLeaderboard={() => setScreen('leaderboard')}
      />
    );
  }

  if (screen === 'game') {
    return (
      <GameScreen
        playerName={playerName}
        onFinish={(score) => {
          setResult(score);
          setScreen('leaderboard');
        }}
      />
    );
  }

  return (
    <Leaderboard
      playerName={playerName}
      highlightId={result?.id || ''}
      onHome={() => setScreen('home')}
    />
  );
}
