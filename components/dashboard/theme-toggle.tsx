'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const raw = localStorage.getItem('theme');
    const stored =
      raw === 'light' || raw === 'dark' ? (raw as 'light' | 'dark') : null;
    const systemPrefers = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    const initial = stored ?? (systemPrefers ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.style.colorScheme =
      initial === 'dark' ? 'dark' : 'light';
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme =
      next === 'dark' ? 'dark' : 'light';
  };

  if (!mounted) {
    return <span aria-hidden className="size-11 shrink-0" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Włącz tryb jasny' : 'Włącz tryb ciemny'}
      className="rounded-full hover:bg-foreground/5"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
