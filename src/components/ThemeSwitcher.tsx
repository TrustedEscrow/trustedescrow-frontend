'use client';

import { useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark' | 'system';

const KEY = 'trustescrow-theme';
/** Fired on the window so the switcher updates in the tab that made the change. */
const CHANGED = 'trustescrow-theme-change';

function storedTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Both halves matter: the stored preference drives the label, and the resolved value
 * drives the class. Encoding them together means a system-level change while the
 * preference is "system" still produces a new snapshot, so the class is reapplied.
 */
function snapshot(): string {
  const pref = storedTheme();
  const dark = pref === 'dark' || (pref === 'system' && prefersDark());
  return `${pref}|${dark ? 'dark' : 'light'}`;
}

/** localStorage is not readable while server-rendering, so SSR assumes the default. */
function serverSnapshot(): string {
  return 'system|light';
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    mql.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function ThemeSwitcher() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [theme, resolved] = snap.split('|') as [Theme, 'dark' | 'light'];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved !== 'dark');
  }, [resolved]);

  const cycleTheme = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-ink focus:ring-2 focus:ring-brand-500 focus:outline-none"
      title={`Theme: ${theme} (click to toggle)`}
      aria-label={`Toggle theme mode, current mode is ${theme}`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'}</span>
      <span className="capitalize">{theme}</span>
    </button>
  );
}
