import { currentMonthKey, shiftMonthKey, TREND_MONTHS } from '@/lib/analytics-finance/months';
import type { TrybDanych } from '@/lib/demo/tryb-danych';
import { formatTimestampDatePl } from '@/lib/format/iso-date';

import { POBIERAMY } from '@/components/dashboard/finora/adaptery';

import type { EmptyStateProps } from './finora/empty';

/**
 * Podpisy i puste stany kart `/analizy/*` zależne od trybu danych
 * (PLAN-PRAWDZIWE-DANE §6.3, E4). Zasada Bartosza 23.10.2026: tylko napisy
 * w istniejących miejscach, o długości dawnych — żadnej nowej linii.
 * Czyste funkcje, więc testuje się je wprost.
 */

/**
 * Z9: faktury kosztowe z KSeF dochodzą od weryfikacji (skrzynka nie sięga
 * wstecz). Gdy weryfikacja wypadła w oknie karty (od miesiąca `fromMonthKey`),
 * podpis mówi „KSeF od DD.MM”; przykład i firmy zweryfikowane wcześniej — nic.
 */
export function ksefOd(tryb: TrybDanych, verifiedAt: string | null | undefined, fromMonthKey: string): string {
  if (tryb === 'przyklad' || !verifiedAt) return '';
  const date = formatTimestampDatePl(verifiedAt);
  if (date === '—') return '';
  const [dd, mm, yyyy] = date.split('.');
  if (`${yyyy}-${mm}` < fromMonthKey) return '';
  return `KSeF od ${dd}.${mm}`;
}

/** Początek okna kart zakresowych (trend, kalendarz): najstarszy z ostatnich 6 miesięcy. */
export function oknoKosztowOd(nowIso: string): string {
  return shiftMonthKey(currentMonthKey(new Date(nowIso)), -(TREND_MONTHS - 1));
}

/**
 * Podpis karty kosztów: koszty to dokumenty z FaktWay (wydatki + faktury
 * zakupu z KSeF), nie wypłaty z konta.
 */
export function podpisKosztow(tail: string, od: string): string {
  return od ? `Z dokumentów, ${od} · ${tail}` : `Z dokumentów w FaktWay · ${tail}`;
}

/** Pusty stan sprzedaży bez żadnej faktury: w stanie B historia się pobiera, więc nie wzywamy do wystawiania. */
export function pobieramy(): EmptyStateProps {
  return { message: POBIERAMY, action: null };
}

export { POBIERAMY };
