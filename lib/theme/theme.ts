export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export const DEFAULT_THEME: Theme = 'dark';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

/** Zapobiega miganiu — domyślnie dark. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var m=t==='light'?'light':'dark';var el=document.documentElement;el.classList.toggle('dark',m==='dark');el.style.colorScheme=m;}catch(e){}})();`;
