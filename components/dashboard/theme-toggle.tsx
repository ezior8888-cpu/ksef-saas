'use client';

import { useCallback, useEffect, useState } from 'react';

import { calculateSunTimes, POLAND_CENTER } from '@/lib/utils/sun';

type ThemeMode = 'light' | 'dark' | 'auto';

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const raw = localStorage.getItem('theme-mode') as ThemeMode | null;
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  const legacy = localStorage.getItem('theme');
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return 'auto';
}

function computeTheme(m: ThemeMode): 'light' | 'dark' {
  if (m === 'light') return 'light';
  if (m === 'dark') return 'dark';
  const now = new Date();
  const { sunrise, sunset } = calculateSunTimes(
    now,
    POLAND_CENTER.lat,
    POLAND_CENTER.lng,
  );
  return now >= sunrise && now < sunset ? 'light' : 'dark';
}

function applyThemeClass(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme =
    theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStoredMode();
    const theme = computeTheme(stored);
    applyThemeClass(theme);
    queueMicrotask(() => {
      setMode(stored);
      setActualTheme(theme);
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => {
      const newTheme = computeTheme('auto');
      setActualTheme((prev) => {
        if (newTheme === prev) return prev;
        applyThemeClass(newTheme);
        return newTheme;
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mode]);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode =
        prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem('theme-mode', next);
      const theme = computeTheme(next);
      setActualTheme(theme);
      applyThemeClass(theme);
      return next;
    });
  }, []);

  if (!mounted) {
    return <div className="h-10 w-10 shrink-0" aria-hidden />;
  }

  const symbol =
    mode === 'auto' ? 'routine' : actualTheme === 'dark' ? 'light_mode' : 'dark_mode';
  const label =
    mode === 'auto'
      ? 'Auto (zmiana o zachodzie słońca)'
      : actualTheme === 'light'
        ? 'Włącz dark mode'
        : 'Włącz light mode';

  return (
    <button
      type="button"
      onClick={cycleMode}
      aria-label={label}
      title={label}
      className="relative rounded-full p-2 text-[var(--ff-on-surface)] transition-colors hover:bg-white/5"
    >
      <span className="material-symbols-outlined text-[22px] leading-none">
        {symbol}
      </span>
      {mode === 'auto' ? (
        <span
          className="pointer-events-none absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--ff-on-surface)]/40"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
