import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'nids_theme';

const ThemeContext = createContext(null);

// Aplică tema pe <html>: adaugă clasa `dark` (pentru variantele Tailwind `dark:`)
// sau `light`, și scoate cealaltă. Sincron cu scriptul anti-flash din index.html.
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

function readInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage indisponibil */
  }
  return 'dark'; // default: dark
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); }
    catch { /* ignore */ }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = { theme, isDark: theme === 'dark', setTheme, toggleTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme trebuie folosit în interiorul <ThemeProvider>');
  return ctx;
}

// Buton reutilizabil de comutare a temei (soare/lună).
export { ThemeContext };
