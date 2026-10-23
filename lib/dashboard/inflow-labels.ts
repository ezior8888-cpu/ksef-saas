/**
 * Podpisy wpływów według terminów płatności (PLAN-PRAWDZIWE-DANE E11,
 * decyzja Bartosza D-W 23.10.2026) w module bez importów — biorą je
 * adaptery serwera i karty klienckie Przepływów (wykres). Klient nic nie
 * oznacza, więc żaden napis nie wzywa do „oznaczania wpłat”.
 */

/** Podpis każdej karty z wpływami. */
export const INFLOW_NOTE = 'według terminów płatności';

/**
 * Pusty stan okresu bez żadnego wpływu (żadna faktura sprzedaży nie ma
 * w nim terminu, zapłaty ani — bez terminu — dnia wystawienia); nigdy
 * „0 zł”. Mieści się w miejscu „wobec poprzedniego miesiąca”.
 */
export const INFLOW_EMPTY = 'Brak faktur z terminem';

/** To samo w dymku, pełnym zdaniem. */
export const INFLOW_EMPTY_TITLE =
  'Brak faktur sprzedaży z terminem płatności w tym okresie. Wpływy liczymy według terminów płatności.';
