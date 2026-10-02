/**
 * Koszt z dokumentu w walucie obcej — przeliczenie na złote (KPiR, JPK).
 *
 * Do 29.09 OCR miał polecenie „kwoty w PLN”: faktura za oprogramowanie
 * w EUR albo USD szła do KPiR z liczbą w euro jako złotówki (albo z kursem
 * „z głowy” modelu). Teraz OCR podaje walutę i kwoty z dokumentu, a
 * przeliczenie robi kurs średni NBP z ostatniego dnia roboczego PRZED datą
 * dokumentu (art. 11a ust. 2 PIT), z numerem tabeli zapisanym przy koszcie.
 *
 * VAT z dokumentu walutowego NIE idzie automatycznie do odliczenia: obcy
 * VAT nie jest do odliczenia w Polsce, a przy polskiej fakturze w walucie
 * podatek w złotych jest osobno na fakturze (P_14_xW) i OCR go nie odczyta
 * pewnie — człowiek to potwierdza.
 */

import { describeMissingRate, stampRate, type RateLookup, type RateStamp } from '@/lib/flo/nbp';
import { roundToCents } from '@/lib/xml/invoice-calculator';

export const HOME_CURRENCY = 'PLN';

export interface DocumentAmounts {
  currency?: string | null;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

export type CostInPln =
  | {
      /** Kwoty gotowe do KPiR. */
      kind: 'pln';
      net: number;
      vat: number;
      gross: number;
      /** Ile VAT-u wolno odliczyć — przy walucie obcej zero do potwierdzenia. */
      vatDeductible: number | null;
      fx: RateStamp | null;
      /** Zdanie do pola „uwagi” wydatku — skąd kwota w złotych. */
      note: string | null;
    }
  | {
      /** Kursu nie ma — kwoty zostają w walucie dokumentu i NIE mogą trafić do KPiR. */
      kind: 'missing_rate';
      note: string;
    };

export function documentCurrency(doc: Pick<DocumentAmounts, 'currency'>): string {
  const code = doc.currency?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : HOME_CURRENCY;
}

function round2(n: number): number {
  return roundToCents(n);
}

function plMoney(n: number, digits = 2): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Kwoty wydatku w złotych. `vatDeductible: null` przy złotówkach znaczy
 * „reguła jak dotąd” (decyduje wołający, np. zwolnienie z VAT).
 */
export function costInPln(doc: DocumentAmounts, issueDate: string, lookup: RateLookup | null): CostInPln {
  const currency = documentCurrency(doc);
  if (currency === HOME_CURRENCY) {
    return { kind: 'pln', net: doc.net_amount, vat: doc.vat_amount, gross: doc.gross_amount, vatDeductible: null, fx: null, note: null };
  }
  if (!lookup || !lookup.found) {
    const why = lookup && !lookup.found ? describeMissingRate(lookup.reason, currency, issueDate) : `Brak kursu ${currency}.`;
    return {
      kind: 'missing_rate',
      note: `Kwoty w ${currency} (${plMoney(doc.gross_amount)} brutto) — nie przeliczone na złote. ${why} Do czasu poprawki wydatek nie jest liczony do KPiR.`,
    };
  }

  const { rate } = lookup;
  const net = round2(doc.net_amount * rate.mid);
  const gross = round2(doc.gross_amount * rate.mid);
  // VAT jako różnica — suma w złotych zgadza się co do grosza.
  const vat = round2(gross - net);
  return {
    kind: 'pln',
    net,
    vat,
    gross,
    vatDeductible: 0,
    fx: stampRate(rate, issueDate),
    note: `Przeliczono z ${plMoney(doc.gross_amount)} ${currency} brutto po kursie ${plMoney(rate.mid, 4)} (tabela ${rate.tableNo} z ${rate.effectiveDate}). VAT z dokumentu w walucie nie jest odliczany automatycznie — sprawdź.`,
  };
}
