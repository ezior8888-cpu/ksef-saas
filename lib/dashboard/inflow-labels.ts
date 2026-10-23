/**
 * Podpisy wpływów według terminów płatności (PLAN-PRAWDZIWE-DANE E11,
 * decyzja Bartosza D-W 23.10.2026) w module bez importów — biorą je
 * adaptery serwera i karty klienckie Przepływów (wykres). Klient nic nie
 * oznacza, więc żaden napis nie wzywa do „oznaczania wpłat”.
 */

/** Podpis każdej karty z wpływami. */
export const INFLOW_NOTE = 'według terminów płatności';

/**
 * Pusty stan okresu bez żadnego wpływu, który już był (żadna faktura
 * sprzedaży nie ma w nim prawdziwej zapłaty, minionego terminu ani — bez
 * terminu — dnia wystawienia); nigdy „0 zł”. Nie „brak faktur z terminem”:
 * termin dziś jest jeszcze spodziewany (recenzja 2), więc faktura z terminem
 * w tym okresie może być. Mieści się w miejscu „wobec poprzedniego miesiąca”.
 */
export const INFLOW_EMPTY = 'Brak wpływów wg terminów';

/** To samo w dymku, pełnym zdaniem. */
export const INFLOW_EMPTY_TITLE =
  'W tym okresie nie ma wpływów według terminów płatności. Termin dziś pokazujemy w Spodziewanych wpływach, na wykresie liczy się od jutra.';
