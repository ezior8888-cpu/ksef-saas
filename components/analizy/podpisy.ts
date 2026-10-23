import { currentMonthKey, HEATMAP_DAYS, lastDaysIso, shiftMonthKey, TREND_MONTHS } from '@/lib/analytics-finance/months';
import { todayInWarsaw } from '@/lib/format/warsaw-date';

import { ksefOd, POBIERAMY } from '@/components/dashboard/finora/adaptery';

import type { EmptyStateProps } from './finora/empty';

/**
 * Podpisy i puste stany kart `/analizy/*` zależne od trybu danych
 * (PLAN-PRAWDZIWE-DANE §6.3, E4). Zasada Bartosza 23.10.2026: tylko napisy
 * w istniejących miejscach, o długości dawnych — żadnej nowej linii.
 * Czyste funkcje, więc testuje się je wprost.
 */

/** Początek okna trendu: najstarszy z ostatnich 6 miesięcy („RRRR-MM”). */
export function oknoKosztowOd(nowIso: string): string {
  return shiftMonthKey(currentMonthKey(new Date(nowIso)), -(TREND_MONTHS - 1));
}

/** Pierwszy dzień kalendarza (`HEATMAP_DAYS` dni, „RRRR-MM-DD”) — okno to dni, nie miesiące. */
export function oknoKalendarzaOd(nowIso: string): string {
  return lastDaysIso(todayInWarsaw(new Date(nowIso)), HEATMAP_DAYS)[0]!;
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

export { ksefOd, POBIERAMY };
