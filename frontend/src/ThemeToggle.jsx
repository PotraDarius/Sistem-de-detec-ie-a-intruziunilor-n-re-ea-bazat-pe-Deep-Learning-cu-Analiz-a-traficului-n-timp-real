import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeContext';

// Buton de comutare dark/light. `className` permite poziționare per-pagină.
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Comută pe tema light' : 'Comută pe tema dark'}
      aria-label={isDark ? 'Comută pe tema light' : 'Comută pe tema dark'}
      className={`flex items-center justify-center h-8 w-8 rounded border transition-colors
        border-zinc-300 bg-white text-amber-500 hover:border-cyan-500/60 hover:bg-zinc-50
        dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-cyan-300 dark:hover:border-cyan-500/60 dark:hover:bg-zinc-900
        ${className}`}
    >
      {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
