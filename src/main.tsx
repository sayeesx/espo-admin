import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Prevent mouse wheel from incrementing/decrementing number inputs while keeping manual entry intact
document.addEventListener(
  'wheel',
  (e) => {
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && activeEl.tagName === 'INPUT' && (activeEl as HTMLInputElement).type === 'number') {
      activeEl.blur();
    }
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
      e.preventDefault();
    }
  },
  { passive: false }
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

