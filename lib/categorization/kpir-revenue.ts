/**
 * Przychód w KPiR (kol. 7) z faktury sprzedaży.
 *
 * Faktura rozliczeniowa (ROZ) zapisuje w `net_total` PEŁNĄ wartość
 * zamówienia (`components/invoices/final-actions.ts`: `totals.netTotal`,
 * bez odjęcia zaliczek), a każda zaliczka, którą rozlicza, jest w KPiR
 * osobno — swoją kwotą. Do 28.09 KPiR sumował jedno i drugie: zaliczka
 * 10 000 zł + ROZ na całe 30 000 zł dawały 40 000 zł przychodu.
 *
 * Z ROZ do przychodu idzie więc reszta ponad zaliczki, które KPiR już
 * policzył (`fetchSettledAdvancesNet`). Suma za cały czas trwania zamówienia
 * się zgadza. MOMENT ujęcia zaliczki (art. 14 ust. 3 pkt 1 PIT — zaliczka na
 * usługę wykonaną w kolejnym okresie nie jest jeszcze przychodem) to osobna
 * sprawa dla księgowej; ta reguła usuwa tylko dubel.
 */

export interface KpirRevenueInput {
  /** `invoices.invoice_kind` albo `JpkInvoice.invoiceType`. */
  kind: string | null | undefined;
  net: number | string | null | undefined;
  /** Suma netto zaliczek rozliczonych tą fakturą (tylko dla ROZ). */
  settledAdvancesNet?: number | null;
}

export function kpirRevenueNet(inv: KpirRevenueInput): number {
  const net = Number(inv.net ?? 0);
  if (inv.kind !== 'final') return round2(net);
  return round2(net - Number(inv.settledAdvancesNet ?? 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
