import {
  fetchSettledAdvancesTotals,
  type SettledAdvanceTotals,
} from '@/lib/invoices/settled-advances';
import type { PageContext } from '@/lib/supabase/page-context';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import { assertOutgoingInvoicesInPln } from '@/lib/exports/currency-guard';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Liczby miesiąca dla szyny dashboardu i dla podsumowania VAT na `/przeplywy`.
 * Wyciągnięte z `app/(dashboard)/dashboard/page.tsx` przy przebudowie na układ
 * z agentem, żeby dwa miejsca nie liczyły tego samego dwoma zapytaniami.
 *
 * ⚠️ NAPRAWA PRZY OKAZJI: stary dashboard filtrował `direction = 'issued'`,
 * a kolumna `invoices.direction` dopuszcza WYŁĄCZNIE `'outgoing' | 'incoming'`
 * (`00001_initial_schema.sql:54`; migracja `00044_phase21_performance.sql:18`
 * ostrzega o tym wprost). Każda z czterech kart KPI pokazywała więc zero,
 * niezależnie od tego, ile faktur miał klient. Tutaj jest `'outgoing'`.
 */

const OUTGOING = 'outgoing' as const;

/** Kolumny, po których `fetchSettledAdvancesTotals` rozpoznaje ROZ i jej zaliczki. */
const SETTLEMENT_COLUMNS = 'id, invoice_kind, advance_invoice_ids';

/**
 * Kwota faktury bez zaliczek, które rozlicza. ROZ trzyma w bazie PEŁNE
 * zamówienie, a VAT i sprzedaż zaliczki pulpit liczy już w jej miesiącu —
 * z ROZ zostaje więc reszta, jak w KPiR i JPK (AUD-26). Inne faktury
 * przechodzą bez zmian.
 */
function remainder(
  settled: Map<string, SettledAdvanceTotals>,
  row: { id: string },
  amount: number | string | null,
  part: keyof SettledAdvanceTotals,
): number {
  return Number(amount ?? 0) - (settled.get(row.id)?.[part] ?? 0);
}

export interface MonthlyFigures {
  /** „sierpień 2026" */
  monthName: string;
  prevAcceptedCount: number;
  acceptedCount: number;
  /** Niezłożone szkice bez przypisanego środowiska KSeF. */
  draftCount: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  /** Zmiana LICZBY przyjętych faktur miesiąc do miesiąca, w procentach. */
  momCountPct: number;
  /** Zmiana KWOTY sprzedaży brutto miesiąc do miesiąca, w procentach. */
  momGrossPct: number;
  /** „25.09.2026" */
  vatDueLabel: string;
  daysToVatDue: number;
  /** Bieżący miesiąc jest najlepszy w roku pod względem sprzedaży brutto. */
  isBestMonthOfYear: boolean;
  /** Czy poprzedni miesiąc ma przyjętą fakturę — bez tego procent nie istnieje. */
  hasPrevMonth: boolean;
}

type InvoiceSummary = {
  id: string;
  issue_date: string;
  invoice_kind: string | null;
  advance_invoice_ids: string[] | null;
  gross_total: number | string | null;
  net_total: number | string | null;
  vat_total: number | string | null;
  currency: string | null;
};

/**
 * Pierwszy dzień miesiąca jako RRRR-MM-DD. Arytmetyka w UTC na polach
 * kalendarza (`monthIndex` może wyjść poza 0–11), więc wynik nie zależy od
 * strefy procesu.
 */
function monthStartIso(year: number, monthIndex: number): string {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Rok i miesiąc (0–11) „dziś” w Polsce. Plan Finora §2.4 pkt 10: serwer
 * i worker chodzą w UTC, więc `now.getMonth()` 1. dnia miesiąca między
 * 00:00 a 02:00 czasu polskiego dawał jeszcze poprzedni miesiąc — faktura
 * z dziś wypadała z liczb miesiąca, a termin VAT był o miesiąc za wcześnie.
 */
function warsawCalendar(now: Date): { today: string; year: number; monthIndex: number } {
  const today = todayInWarsaw(now);
  return {
    today,
    year: Number(today.slice(0, 4)),
    monthIndex: Number(today.slice(5, 7)) - 1,
  };
}

/** Dni kalendarzowe między dwiema datami RRRR-MM-DD (bez stref i zmian czasu). */
function daysBetweenIsoDates(fromIso: string, toIso: string): number {
  const utc = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

/** Pierwszy dzień miesiąca jako `Date` w UTC — tylko do podpisów z `timeZone: 'UTC'`. */
function monthStartUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

/**
 * An accepted invoice with no stored environment could belong to TEST or
 * production. A zero-only dashboard would hide that historical ambiguity.
 * Known invoices in another environment are excluded by the monetary query.
 */
async function assertAcceptedEnvironmentKnown(
  supabase: PageContext['supabase'],
  tenantId: string,
  start: string,
  endExclusive: string,
): Promise<void> {
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('direction', OUTGOING)
    .eq('ksef_status', 'accepted')
    .is('ksef_environment', null)
    .gte('issue_date', start)
    .lt('issue_date', endExclusive);
  if (error || typeof count !== 'number') {
    throw new Error('Nie można sprawdzić środowiska faktur KSeF');
  }
  if (count > 0) {
    throw new Error('Przyjęte faktury wymagają uzgodnienia środowiska KSeF');
  }
}

/**
 * PostgREST can cap a successful response. Counted pages make an incomplete
 * month a visible error instead of silently understating VAT and sales.
 */
async function fetchAcceptedInvoices(
  supabase: PageContext['supabase'],
  tenantId: string,
  environment: KsefEnvironment,
  start: string,
  endExclusive: string,
  errorMessage: string,
): Promise<InvoiceSummary[]> {
  const rows = await readCompletePages(errorMessage, (from, to) => supabase
      .from('invoices')
      .select(`issue_date, gross_total, net_total, vat_total, currency, ${SETTLEMENT_COLUMNS}`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('direction', OUTGOING)
      .eq('ksef_status', 'accepted')
      .eq('ksef_environment', environment)
      .gte('issue_date', start)
      .lt('issue_date', endExclusive)
      .order('id', { ascending: true })
      .range(from, to));
  // C-11: sumy w złotych — faktura walutowa albo bez waluty zatrzymuje pulpit.
  assertOutgoingInvoicesInPln(rows);
  return rows;
}

async function countLocalDrafts(
  supabase: PageContext['supabase'],
  tenantId: string,
  start: string,
  endExclusive: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('direction', OUTGOING)
    .eq('ksef_status', 'draft')
    .is('ksef_environment', null)
    .gte('issue_date', start)
    .lt('issue_date', endExclusive);
  if (error || typeof count !== 'number') {
    throw new Error('Nie można odczytać liczby szkiców');
  }
  return count;
}

/**
 * Formatery przeniesione do `lib/format/pl.ts` (moduł bez importów, więc
 * nadaje się też do komponentów klienckich). Re-eksport zostaje, żeby nie
 * przepisywać wywołań w stronach, które już go stąd biorą.
 */
export { formatPlInt, formatPlMoney } from '@/lib/format/pl';

export async function getMonthlyFigures(
  supabase: PageContext['supabase'],
  tenantId: string,
  now: Date = new Date(),
): Promise<MonthlyFigures> {
  const { today, year, monthIndex } = warsawCalendar(now);
  const startOfMonthIso = monthStartIso(year, monthIndex);
  const prevMonthStartIso = monthStartIso(year, monthIndex - 1);
  const nextMonthStartIso = monthStartIso(year, monthIndex + 1);
  const yearStartIso = monthStartIso(year, 0);
  const readStartIso = prevMonthStartIso < yearStartIso ? prevMonthStartIso : yearStartIso;
  const environment = requireConfiguredKsefEnvironment();

  await assertAcceptedEnvironmentKnown(
    supabase, tenantId, readStartIso, nextMonthStartIso,
  );
  const [acceptedInvoices, draftCount] = await Promise.all([
    fetchAcceptedInvoices(
      supabase, tenantId, environment, readStartIso, nextMonthStartIso,
      'Nie można odczytać liczb miesiąca',
    ),
    countLocalDrafts(supabase, tenantId, startOfMonthIso, nextMonthStartIso),
  ]);
  const monthInvoices = acceptedInvoices.filter((invoice) =>
    invoice.issue_date >= startOfMonthIso);
  const prevInvoices = acceptedInvoices.filter((invoice) =>
    invoice.issue_date >= prevMonthStartIso && invoice.issue_date < startOfMonthIso);
  const ytdInvoices = acceptedInvoices.filter((invoice) =>
    invoice.issue_date >= yearStartIso);

  // ROZ bez rozliczonych zaliczek (AUD-26). Bieżący miesiąc zawiera się w YTD,
  // więc jedno odczytanie obejmuje wszystkie trzy zbiory.
  const settled = await fetchSettledAdvancesTotals(supabase, tenantId, [
    ...prevInvoices,
    ...ytdInvoices,
  ]);

  const acceptedCount = monthInvoices.length;
  const totalNet =
    monthInvoices.reduce((sum, i) => sum + remainder(settled, i, i.net_total, 'net'), 0);
  const totalVat =
    monthInvoices.reduce((sum, i) => sum + remainder(settled, i, i.vat_total, 'vat'), 0);
  const totalGross =
    monthInvoices.reduce((sum, i) => sum + remainder(settled, i, i.gross_total, 'gross'), 0);

  const ytdByMonth = new Map<string, number>();
  ytdInvoices.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    ytdByMonth.set(key, (ytdByMonth.get(key) ?? 0) + remainder(settled, inv, inv.gross_total, 'gross'));
  });
  const maxYtdMonthGross = Math.max(0, ...Array.from(ytdByMonth.values()));

  const prevAcceptedCount = prevInvoices.length;
  const prevGross =
    prevInvoices.reduce((sum, i) => sum + remainder(settled, i, i.gross_total, 'gross'), 0);

  /**
   * Zmiana procentowa liczona osobno dla liczby faktur i dla kwoty — te dwie
   * rzeczy rozjeżdżają się przy jednej dużej fakturze i podpisanie kwoty
   * zmianą liczby sztuk było zwykłym kłamstwem na ekranie.
   *
   * Brak poprzedniego miesiąca nie jest wzrostem o 100%: przy zerowej
   * podstawie procent nie istnieje, więc zwracamy `null` i interfejs
   * pokazuje wtedy co innego.
   */
  const zmiana = (teraz: number, przedtem: number): number | null =>
    przedtem > 0 ? Math.round(((teraz - przedtem) / przedtem) * 100) : null;

  // Termin VAT: 25. dzień miesiąca po polskim „dziś”. Dni po dobach
  // kalendarzowych od polskiej daty, nie po milisekundach od `now`.
  const vatDueIso = `${nextMonthStartIso.slice(0, 8)}25`;
  const daysToVatDue = Math.max(0, daysBetweenIsoDates(today, vatDueIso));

  return {
    monthName: monthStartUtc(year, monthIndex).toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    prevAcceptedCount,
    acceptedCount,
    draftCount,
    totalNet,
    totalVat,
    totalGross,
    momCountPct: zmiana(acceptedCount, prevAcceptedCount) ?? 0,
    momGrossPct: zmiana(totalGross, prevGross) ?? 0,
    hasPrevMonth: prevAcceptedCount > 0,
    vatDueLabel: `${vatDueIso.slice(8, 10)}.${vatDueIso.slice(5, 7)}.${vatDueIso.slice(0, 4)}`,
    daysToVatDue,
    isBestMonthOfYear:
      totalGross > 0 &&
      maxYtdMonthGross > 0 &&
      totalGross >= maxYtdMonthGross - 0.01,
  };
}

export interface SalesSeries {
  months: { key: string; label: string }[];
  currentSeries: number[];
  prevSeries: number[];
  currentMonthKey: string;
}

/** Sześć miesięcy kalendarzowych + to samo okno rok wcześniej (linia odniesienia). */
export async function getSalesSeries(
  supabase: PageContext['supabase'],
  tenantId: string,
  now: Date = new Date(),
): Promise<SalesSeries> {
  const { today, year, monthIndex } = warsawCalendar(now);
  const months: { key: string; prevKey: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = monthStartUtc(year, monthIndex - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const prevKey = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const raw = d
      .toLocaleDateString('pl-PL', { month: 'short', timeZone: 'UTC' })
      .replace(/\./g, '')
      .trim();
    months.push({
      key,
      prevKey,
      label: raw.charAt(0).toUpperCase() + raw.slice(1),
    });
  }

  const windowStartIso = `${months[0]!.key}-01`;
  const prevYearStartIso = `${months[0]!.prevKey}-01`;
  const nextMonthStartIso = monthStartIso(year, monthIndex + 1);
  const prevYearEndIso = monthStartIso(year - 1, monthIndex + 1);
  const environment = requireConfiguredKsefEnvironment();
  await Promise.all([
    assertAcceptedEnvironmentKnown(
      supabase, tenantId, windowStartIso, nextMonthStartIso,
    ),
    assertAcceptedEnvironmentKnown(
      supabase, tenantId, prevYearStartIso, prevYearEndIso,
    ),
  ]);
  const [current, previous] = await Promise.all([
    fetchAcceptedInvoices(
      supabase, tenantId, environment, windowStartIso, nextMonthStartIso,
      'Nie można odczytać wykresu sprzedaży',
    ),
    fetchAcceptedInvoices(
      supabase, tenantId, environment, prevYearStartIso, prevYearEndIso,
      'Nie można odczytać wykresu sprzedaży',
    ),
  ]);

  const settled = await fetchSettledAdvancesTotals(supabase, tenantId, [
    ...(current ?? []),
    ...(previous ?? []),
  ]);

  const sumByMonth = (
    rows: InvoiceSummary[],
  ) => {
    const map = new Map<string, number>();
    rows.forEach((inv) => {
      const key = inv.issue_date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + remainder(settled, inv, inv.gross_total, 'gross'));
    });
    return map;
  };

  const currentByMonth = sumByMonth(current);
  const prevByMonth = sumByMonth(previous);

  return {
    months: months.map(({ key, label }) => ({ key, label })),
    currentSeries: months.map((m) => currentByMonth.get(m.key) ?? 0),
    prevSeries: months.map((m) => prevByMonth.get(m.prevKey) ?? 0),
    currentMonthKey: today.slice(0, 7),
  };
}
