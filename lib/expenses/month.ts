import { todayInWarsaw } from '@/lib/format/warsaw-date';

/**
 * Miesiąc na liście wydatków (F-087 w raporcie audytu bloku 1). Lista
 * pokazywała tylko bieżący miesiąc liczony w strefie serwera, bez górnej
 * granicy i bez możliwości przejścia do innego miesiąca — starsze wydatki
 * były osiągalne tylko przez KPiR. Miesiąc „RRRR-MM” z adresu, domyślnie
 * bieżący w czasie polskim.
 */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Miesiąc z adresu albo bieżący (Europe/Warsaw); przyszłe miesiące → bieżący. */
export function parseExpenseMonth(raw: string | undefined, now: Date = new Date()): string {
  const current = todayInWarsaw(now).slice(0, 7);
  if (!raw || !MONTH.test(raw)) return current;
  return raw > current ? current : raw;
}

/** Pierwszy i ostatni dzień miesiąca jako RRRR-MM-DD. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Miesiąc przesunięty o `delta`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Nazwa miesiąca po polsku, np. „wrzesień 2026”. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
}
