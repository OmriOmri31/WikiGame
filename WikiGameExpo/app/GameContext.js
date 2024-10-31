// app/GameContext.js

import React, { createContext, useState } from 'react';

/**
 * GameContext - Context for storing game data across screens.
 */
export const GameContext = createContext();

/**
 * GameProvider - Provider component for GameContext.
 *
 * @param {object} props - Props containing children components.
 * @returns {JSX.Element} The provider component.
 */
export const GameProvider = ({ children }) => {
    const [gameData, setGameData] = useState({
        timeTaken: null,
        targetArticleTitle: '',
        targetArticleUrl: '',
    });

    return (
        <GameContext.Provider value={{ gameData, setGameData }}>
            {children}
        </GameContext.Provider>
    );
};
