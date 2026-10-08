'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('trustescrow-theme') as Theme) || 'system';
    setTheme(saved);
    applyTheme(saved);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = (localStorage.getItem('trustescrow-theme') as Theme) || 'system';
      if (current === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const applyTheme = (t: Theme) => {
    const isDark =
      t === 'dark' ||
      (t === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  };

  const cycleTheme = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    setTheme(next);
    localStorage.setItem('trustescrow-theme', next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
      title={`Theme: ${theme} (click to toggle)`}
      aria-label={`Toggle theme mode, current mode is ${theme}`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'}</span>
      <span className="capitalize">{theme}</span>
    </button>
  );
}
