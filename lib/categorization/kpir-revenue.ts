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

import { roundToCents } from '@/lib/xml/invoice-calculator';

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

/**
 * Data zdarzenia gospodarczego (kol. 2 KPiR) dla sprzedaży: dzień dostawy /
 * wykonania usługi, czyli data sprzedaży z faktury (P_6), a bez niej — data
 * wystawienia. Przychód powstaje w dniu sprzedaży, nie później niż w dniu
 * wystawienia faktury (art. 14 ust. 1c PIT); formularz nie pozwala na datę
 * sprzedaży późniejszą niż wystawienie.
 */
export function kpirSaleEventDate(inv: { saleDate?: string | null; issueDate: string }): string {
  const sale = inv.saleDate?.trim();
  return sale && sale < inv.issueDate ? sale : inv.issueDate;
}

/**
 * Faktura wystawiona w okresie za sprzedaż z WCZEŚNIEJSZEGO okresu (np. usługa
 * 31.08, faktura 3.09). KPiR okresu jej nie gubi — pokazuje ją z datą
 * sprzedaży i tą uwagą, żeby księgowa ujęła przychód we właściwym miesiącu.
 * `null`, gdy sprzedaż mieści się w okresie.
 */
export function earlierSaleRemark(
  inv: { saleDate?: string | null; issueDate: string },
  periodStart: string,
): string | null {
  const event = kpirSaleEventDate(inv);
  if (event >= periodStart) return null;
  return `sprzedaż z ${plDate(event)}, faktura z ${plDate(inv.issueDate)} — przychód okresu sprzedaży (art. 14 ust. 1c PIT)`;
}

function plDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function round2(n: number): number {
  return roundToCents(n);
}
