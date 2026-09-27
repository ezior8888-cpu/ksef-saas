/**
 * Kwota kosztu w KPiR dla wydatku.
 *
 * Koszt to netto + VAT, którego podatnikowi NIE WOLNO odliczyć
 * (art. 23 ust. 1 pkt 43 lit. a ustawy o PIT): paragon, firma zwolniona
 * z VAT, samochód 50%. VAT, który wolno było odliczyć, kosztem nie jest —
 * faktura czynnego podatnika zostaje w KPiR po netto.
 *
 * Do 27.09 KPiR brał netto zawsze: paragon za 1 230 zł (230 zł VAT) szedł
 * jako 1 000 zł kosztu, a klient przepłacał podatek dochodowy.
 */

/** Dokumenty, z których czynny podatnik odlicza VAT (to samo co JPK_V7M). */
export const VAT_DEDUCTIBLE_DOCUMENTS: ReadonlySet<string> = new Set(['invoice', 'simplified_invoice']);

export interface KpirCostInput {
  net_amount: number | string | null;
  vat_amount: number | string | null;
  vat_deductible_amount: number | string | null;
  document_type: string | null;
}

/** VAT z dokumentu, którego nie odliczamy — wchodzi w koszt. */
export function nonDeductedVat(e: KpirCostInput): number {
  const vat = Number(e.vat_amount ?? 0);
  if (!(vat > 0)) return 0;
  const deducted = VAT_DEDUCTIBLE_DOCUMENTS.has(e.document_type ?? 'invoice')
    ? Math.min(vat, Math.max(0, Number(e.vat_deductible_amount ?? 0)))
    : 0;
  return round2(vat - deducted);
}

export function kpirCostAmount(e: KpirCostInput): number {
  return round2(Number(e.net_amount ?? 0) + nonDeductedVat(e));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
