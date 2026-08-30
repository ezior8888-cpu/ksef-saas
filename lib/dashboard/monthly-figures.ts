import type { PageContext } from '@/lib/supabase/page-context';

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

export interface MonthlyFigures {
  /** „sierpień 2026" */
  monthName: string;
  issuedCount: number;
  prevIssuedCount: number;
  acceptedCount: number;
  pendingCount: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  /** Zmiana LICZBY faktur miesiąc do miesiąca, w procentach. */
  momCountPct: number;
  /** Zmiana KWOTY sprzedaży brutto miesiąc do miesiąca, w procentach. */
  momGrossPct: number;
  /** „25.09.2026" */
  vatDueLabel: string;
  daysToVatDue: number;
  /** Bieżący miesiąc jest najlepszy w roku pod względem sprzedaży brutto. */
  isBestMonthOfYear: boolean;
  /** Czy poprzedni miesiąc ma jakąkolwiek fakturę — bez tego procent nie istnieje. */
  hasPrevMonth: boolean;
}

export function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPlInt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

export async function getMonthlyFigures(
  supabase: PageContext['supabase'],
  tenantId: string,
  now: Date = new Date(),
): Promise<MonthlyFigures> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);
  const prevMonthStartIso = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10);
  const yearStartIso = `${now.getFullYear()}-01-01`;

  const [{ data: monthInvoices }, { data: prevInvoices }, { data: ytdInvoices }] =
    await Promise.all([
      supabase
        .from('invoices')
        .select('gross_total, net_total, vat_total, ksef_status')
        .eq('tenant_id', tenantId)
        .eq('direction', OUTGOING)
        .gte('issue_date', startOfMonthIso),
      supabase
        .from('invoices')
        .select('gross_total')
        .eq('tenant_id', tenantId)
        .eq('direction', OUTGOING)
        .gte('issue_date', prevMonthStartIso)
        .lt('issue_date', startOfMonthIso),
      supabase
        .from('invoices')
        .select('gross_total, issue_date')
        .eq('tenant_id', tenantId)
        .eq('direction', OUTGOING)
        .gte('issue_date', yearStartIso),
    ]);

  const issuedCount = monthInvoices?.length ?? 0;
  const acceptedCount =
    monthInvoices?.filter((i) => i.ksef_status === 'accepted').length ?? 0;
  const totalNet =
    monthInvoices?.reduce((sum, i) => sum + Number(i.net_total ?? 0), 0) ?? 0;
  const totalVat =
    monthInvoices?.reduce((sum, i) => sum + Number(i.vat_total ?? 0), 0) ?? 0;
  const totalGross =
    monthInvoices?.reduce((sum, i) => sum + Number(i.gross_total ?? 0), 0) ?? 0;

  const ytdByMonth = new Map<string, number>();
  ytdInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    ytdByMonth.set(key, (ytdByMonth.get(key) ?? 0) + Number(inv.gross_total ?? 0));
  });
  const maxYtdMonthGross = Math.max(0, ...Array.from(ytdByMonth.values()));

  const prevIssuedCount = prevInvoices?.length ?? 0;
  const prevGross =
    prevInvoices?.reduce((sum, i) => sum + Number(i.gross_total ?? 0), 0) ?? 0;

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

  const vatDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 25);
  /** Dni do terminu VAT liczone po dobach kalendarzowych, nie po milisekundach. */
  const daysToVatDue = Math.max(
    0,
    Math.round(
      (new Date(
        vatDueDate.getFullYear(),
        vatDueDate.getMonth(),
        vatDueDate.getDate(),
      ).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86_400_000,
    ),
  );

  return {
    monthName: startOfMonth.toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    }),
    issuedCount,
    prevIssuedCount,
    acceptedCount,
    pendingCount: Math.max(0, issuedCount - acceptedCount),
    totalNet,
    totalVat,
    totalGross,
    momCountPct: zmiana(issuedCount, prevIssuedCount) ?? 0,
    momGrossPct: zmiana(totalGross, prevGross) ?? 0,
    hasPrevMonth: prevIssuedCount > 0,
    vatDueLabel: vatDueDate.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
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
  const months: { key: string; prevKey: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevKey = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const raw = d
      .toLocaleDateString('pl-PL', { month: 'short' })
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

  const [{ data: current }, { data: previous }] = await Promise.all([
    supabase
      .from('invoices')
      .select('gross_total, issue_date')
      .eq('tenant_id', tenantId)
      .eq('direction', OUTGOING)
      .gte('issue_date', windowStartIso),
    supabase
      .from('invoices')
      .select('gross_total, issue_date')
      .eq('tenant_id', tenantId)
      .eq('direction', OUTGOING)
      .gte('issue_date', prevYearStartIso)
      .lt('issue_date', windowStartIso),
  ]);

  const sumByMonth = (
    rows: { gross_total: number | string | null; issue_date: string }[] | null,
  ) => {
    const map = new Map<string, number>();
    rows?.forEach((inv) => {
      const key = inv.issue_date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(inv.gross_total ?? 0));
    });
    return map;
  };

  const currentByMonth = sumByMonth(current);
  const prevByMonth = sumByMonth(previous);

  return {
    months: months.map(({ key, label }) => ({ key, label })),
    currentSeries: months.map((m) => currentByMonth.get(m.key) ?? 0),
    prevSeries: months.map((m) => prevByMonth.get(m.prevKey) ?? 0),
    currentMonthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  };
}
