'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  applyTheme,
  readStoredTheme,
  type Theme,
  THEME_STORAGE_KEY,
} from '@/lib/theme/theme';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    applyTheme(stored);
    queueMicrotask(() => {
      setTheme(stored);
      setMounted(true);
    });
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) {
    return <div className="size-10 shrink-0" aria-hidden />;
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-[var(--ff-border)] bg-[var(--ff-surface)] text-[var(--ff-text-muted)] transition-colors',
        'hover:text-[var(--ff-text)]',
      )}
    >
      <span className="material-symbols-outlined text-[18px] leading-none">
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  );
}
