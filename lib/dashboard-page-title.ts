/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Tytuł strony w PASKU NAGŁÓWKA, w jednym rzędzie z przełącznikiem organizacji
 * — tak stoi na prototypie z sierpnia 2026. Dziś wpis ma tylko `/dashboard`;
 * pozostałe trasy nadal rysują własny `<h1>` w treści, a lewa strona nagłówka
 * zostaje dla nich pusta, dokładnie jak przed zmianą. Przenoszenie tytułów
 * reszty stron to osobna robota — dopisanie tu wiersza BEZ usunięcia `<h1>`
 * z danej strony da dwa tytuły jeden nad drugim.
 */
export interface DashboardPageTitle {
  title: string;
  /** Podtytuł zależny od daty — liczony przy renderze, nie zapisany na stałe. */
  subtitle?: (now: Date) => string;
}

/** Miesiąc i rok po polsku, małą literą: „sierpień 2026”. */
function monthYear(now: Date): string {
  return now.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

export const DASHBOARD_PAGE_TITLES: Record<string, DashboardPageTitle> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: (now) => `${monthYear(now)} · deklaracja JPK_V7`,
  },
};

export function getDashboardPageTitle(
  pathname: string,
): DashboardPageTitle | null {
  return DASHBOARD_PAGE_TITLES[pathname] ?? null;
}
