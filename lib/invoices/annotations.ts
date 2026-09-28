/**
 * Adnotacje FA(3) zwykłej faktury — z formularza i ustawień firmy.
 *
 * Czyste funkcje: plik akcji ma `'use server'` i może eksportować wyłącznie
 * funkcje asynchroniczne, więc logika żyje tutaj i tu jest testowana.
 */
import type { Invoice, InvoiceLineItem } from '@/types/invoice';

/**
 * Próg MPP: faktura na kwotę brutto co najmniej 15 000 zł (art. 108a ust. 1a
 * ustawy o VAT) z towarem/usługą z zał. 15. Aplikacja nie zna zał. 15 —
 * podpowiada przy fakturze dla firmy powyżej progu, decyduje klient.
 */
export const SPLIT_PAYMENT_THRESHOLD_PLN = 15_000;

/** Obowiązkowe wyrazy na fakturze z MPP (art. 106e ust. 1 pkt 18a). */
export const SPLIT_PAYMENT_LABEL = 'mechanizm podzielonej płatności';

export function suggestsSplitPayment(grossTotal: number, buyerIsConsumer: boolean): boolean {
  return !buyerIsConsumer && grossTotal >= SPLIT_PAYMENT_THRESHOLD_PLN;
}

export function buildInvoiceAnnotations(input: {
  lines: ReadonlyArray<Pick<InvoiceLineItem, 'vatRate'>>;
  /** Podstawa zwolnienia z VAT firmy (#60) — `null` = czynny podatnik. */
  vatExemptionBasis: string | null;
  splitPayment: boolean;
}): Invoice['annotations'] {
  const annotations: NonNullable<Invoice['annotations']> = {};
  // P_19A tylko przy pozycji zwolnionej — inaczej FA(3) dostaje P_19N.
  if (input.vatExemptionBasis && input.lines.some((l) => l.vatRate === 'zw')) {
    annotations.vatExemptionBasis = input.vatExemptionBasis;
  }
  // P_18A = 1 — mechanizm podzielonej płatności.
  if (input.splitPayment) annotations.splitPayment = 1;
  return Object.keys(annotations).length > 0 ? annotations : undefined;
}
