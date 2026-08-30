export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika).
 *
 * Od 30.08.2026 domyślny motyw to JASNY — panel został przemalowany na biel
 * z prototypu. Wcześniej domyślny był ciemny, a zapis czytano regułą „cokolwiek
 * poza dosłownym 'light' znaczy dark”. Ta reguła jest tutaj odwrócona
 * SYMETRYCZNIE (`=== 'dark' ? 'dark' : 'light'`), żeby uszkodzony albo cudzy
 * wpis w localStorage kończył się motywem domyślnym, a nie drugim.
 */
export const DEFAULT_THEME: Theme = 'light';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

/**
 * Zapobiega miganiu — domyślnie jasny.
 *
 * Skrypt musi zdjąć klasę `dark`, a nie tylko jej nie dodawać: `<html>` nie
 * niesie już `dark` z serwera, ale bywa dokładana przez rozszerzenia
 * przeglądarki i przez HMR po zmianie motywu w poprzednim renderze.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var m=t==='dark'?'dark':'light';var el=document.documentElement;el.classList.toggle('dark',m==='dark');el.style.colorScheme=m;}catch(e){}})();`;
