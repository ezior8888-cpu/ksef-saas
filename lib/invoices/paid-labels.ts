/**
 * Podpisy wpływów (plan Finora §2.4 pkt 14) w module bez importów — biorą je
 * i kafel „Opłacone” listy faktur (`lib/invoices/list-stats.ts`), i karty
 * komponentów klienckich `/przeplywy`, które nie mogą ciągnąć kodu
 * serwerowego z `list-stats.ts`.
 */

/** Podpis każdej karty z wpływami. */
export const PAID_NOTE = 'według oznaczonych wpłat';
/** Pusty stan, gdy w okresie nie ma żadnej opłaconej faktury — nigdy „0 zł”. */
export const PAID_EMPTY_STATE = 'Oznaczaj wpłaty, a pokażemy wpływy';
