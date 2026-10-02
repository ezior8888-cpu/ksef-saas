/**
 * Data sprzedaży (dostawy / wykonania usługi) a data wystawienia faktury.
 *
 * Art. 106i ust. 7 ustawy o VAT: fakturę można wystawić najwcześniej 60. dnia
 * przed dostawą lub wykonaniem usługi — data sprzedaży może więc wypaść do
 * 60 dni PO dacie wystawienia. Wcześniej formularz i walidacja przy wysyłce
 * zabraniały jakiejkolwiek daty późniejszej (F-014 w raporcie audytu bloku 1).
 *
 * Moduł bez importów — używa go i schemat formularza, i `validateInvoice`.
 */

export const MAX_SALE_DAYS_AFTER_ISSUE = 60;

export const SALE_DATE_TOO_LATE_MESSAGE =
  'Data sprzedaży może być najwyżej 60 dni po dacie wystawienia (art. 106i ust. 7 ustawy o VAT).';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Czy data sprzedaży mieści się w dozwolonym odstępie od daty wystawienia (daty RRRR-MM-DD). */
export function isSaleDateWithinLimit(issueIso: string, saleIso: string): boolean {
  const issue = Date.parse(`${issueIso}T00:00:00Z`);
  const sale = Date.parse(`${saleIso}T00:00:00Z`);
  if (Number.isNaN(issue) || Number.isNaN(sale)) return true; // format sprawdza inna reguła
  return sale - issue <= MAX_SALE_DAYS_AFTER_ISSUE * DAY_MS;
}
