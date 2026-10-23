import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyInitialTheme } from './theme';
import './styles.css';
import { syncSystemBars } from './systemBars';

applyInitialTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

syncSystemBars();
