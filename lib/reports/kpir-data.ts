import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import { kpirCostAmount } from '@/lib/categorization/kpir-cost';
import { kpirRevenueNet } from '@/lib/categorization/kpir-revenue';
import { assertOutgoingInvoicesInPln } from '@/lib/exports/currency-guard';
import { assertKsefExpensesReadyForPln } from '@/lib/expenses/ksef-currency-review';
import { filterExpensesForKsefEnvironment } from '@/lib/expenses/ksef-environment';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { fetchSettledAdvancesNet } from '@/lib/invoices/settled-advances';
import { assertAcceptedInvoiceEnvironmentComplete } from '@/lib/ksef/accounting-provenance';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { PageContext } from '@/lib/supabase/page-context';
import type { Database } from '@/types/database';

/**
 * Odczyt KPiR za miesiąc (`/reports/kpir`) — wyjęty ze strony do funkcji
 * (plan Finora §9, E8), żeby testy pilnowały danych, a nie znaczników.
 * Logika 1:1 jak dotąd w stronie:
 *
 * - środowisko KSeF najpierw (`requireConfiguredKsefEnvironment`), potem
 *   kontrola proweniencji przyjętych faktur okresu — obie RZUCAJĄ;
 * - koszty: `is_deductible = true`, pełne strony, filtr środowiska KSeF,
 *   koszt KSeF w walucie obcej zatrzymuje raport (C-11) — baner, nie kwoty;
 * - przychody: sprzedaż przyjęta w aktywnym środowisku, waluta PLN, a ROZ
 *   liczy tylko resztę ponad zaliczki (`fetchSettledAdvancesNet`).
 *
 * Domyślny okres to miesiąc „dziś” w Polsce (§2.4 pkt 10); granice
 * z arytmetyki UTC, bez strefy procesu.
 */

export type KpirExpenseRow = Database['public']['Tables']['expenses']['Row'];

export type KpirInvoiceRow = Pick<
  Database['public']['Tables']['invoices']['Row'],
  'id' | 'internal_number' | 'issue_date' | 'sale_date' | 'gross_total' | 'net_total' | 'buyer_data' | 'invoice_kind'
> & {
  /** ROZ: suma netto zaliczek, które KPiR już liczy (`fetchSettledAdvancesNet`). */
  settled_advances_net?: number | null;
};

export interface KpirSearchParams {
  month?: string;
  year?: string;
}

export interface KpirData {
  month: number;
  year: number;
  /** RRRR-MM-01 */
  periodStart: string;
  /** Ostatni dzień miesiąca, RRRR-MM-DD. */
  periodEnd: string;
  expenses: KpirExpenseRow[];
  invoices: KpirInvoiceRow[];
  /** Waluty nie do potwierdzenia: raport wstrzymany (bez tabeli). */
  currencyBlocked: string | null;
  /** Zaliczek ROZ nie dało się odczytać: baner nad tabelą. */
  settledError: string | null;
}

function clampMonth(m: number): number {
  if (!Number.isFinite(m)) return 1;
  return Math.min(12, Math.max(1, Math.floor(m)));
}

function clampYear(y: number, fallback: number): number {
  if (!Number.isFinite(y)) return fallback;
  const yi = Math.floor(y);
  if (yi < 2000 || yi > 2100) return fallback;
  return yi;
}

/** Miesiąc i granice okresu z parametrów adresu; domyślnie miesiąc „dziś” w Polsce. */
export function resolveKpirPeriod(sp: KpirSearchParams, now: Date = new Date()) {
  const today = todayInWarsaw(now);
  const nowYear = Number(today.slice(0, 4));
  const month = clampMonth(Number(sp.month ?? Number(today.slice(5, 7))));
  const year = clampYear(Number(sp.year ?? nowYear), nowYear);
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { month, year, periodStart, periodEnd };
}

export async function getKpirData(
  supabase: PageContext['supabase'],
  tenantId: string,
  sp: KpirSearchParams,
  now: Date = new Date(),
): Promise<KpirData> {
  const environment = requireConfiguredKsefEnvironment();
  const { month, year, periodStart, periodEnd } = resolveKpirPeriod(sp, now);

  await assertAcceptedInvoiceEnvironmentComplete(supabase, {
    tenantId, periodStart, periodEnd, direction: 'outgoing', environment,
  });

  const expenses = await readCompletePages('expenses', (from, to) => supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('is_deductible', true)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('id', { ascending: true })
    .range(from, to));
  const visibleExpenses = await filterExpensesForKsefEnvironment(
    supabase, tenantId, environment, expenses,
  );
  visibleExpenses.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));

  // C-11: koszt KSeF w walucie obcej wchodzi do KPiR dopiero z przeglądem
  // i śladem kursu; bez tego raport się zatrzymuje, zamiast liczyć EUR jak zł.
  let currencyError: string | null = null;
  try {
    await assertKsefExpensesReadyForPln(visibleExpenses, async (ids) => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, currency')
        .eq('tenant_id', tenantId)
        .in('id', ids);
      if (error) throw new Error('Nie można sprawdzić walut faktur KSeF');
      return new Map((data ?? []).map((row) => [row.id as string, row.currency as string | null]));
    });
  } catch (error) {
    currencyError = error instanceof Error ? error.message : 'Nie można potwierdzić walut kosztów KSeF';
  }

  const invoices = await readCompletePages('invoices', (from, to) => supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, sale_date, gross_total, net_total, buyer_data, invoice_kind, advance_invoice_ids, currency',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('ksef_environment', environment)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('id', { ascending: true })
    .range(from, to));
  invoices.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));

  let outgoingCurrencyError: string | null = null;
  try {
    assertOutgoingInvoicesInPln(invoices);
  } catch (error) {
    outgoingCurrencyError = error instanceof Error ? error.message : 'Nie można potwierdzić walut sprzedaży';
  }
  const currencyBlocked = currencyError ?? outgoingCurrencyError;

  // ROZ niesie pełną wartość zamówienia — przychód liczy tylko resztę ponad
  // zaliczki, które KPiR już ma (`kpirRevenueNet`). Bez tej sumy przychód
  // z ROZ byłby zawyżony — błąd idzie na baner nad tabelą.
  let settledError: string | null = null;
  let settled = new Map<string, number>();
  if (!currencyBlocked) {
    try {
      settled = await fetchSettledAdvancesNet(supabase, tenantId, invoices);
    } catch (e) {
      settledError = e instanceof Error ? e.message : 'Nie można odczytać zaliczek';
    }
  }
  const invoiceRows: KpirInvoiceRow[] = invoices.map((inv) => ({
    ...inv,
    settled_advances_net: settled.get(inv.id) ?? null,
  }));

  return {
    month, year, periodStart, periodEnd,
    expenses: visibleExpenses,
    invoices: invoiceRows,
    currencyBlocked,
    settledError,
  };
}

/** Przychód KPiR jednej faktury (ROZ: reszta ponad zaliczki). */
export function kpirInvoiceRevenue(inv: KpirInvoiceRow): number {
  return kpirRevenueNet({
    kind: inv.invoice_kind,
    net: inv.net_total,
    settledAdvancesNet: inv.settled_advances_net,
  });
}

export interface KpirTotals {
  col_7: number;
  col_8: number;
  col_10: number;
  col_11: number;
  col_12: number;
  col_13: number;
  col_15: number;
  totalRevenue: number;
  /** Razem kol. 14 (kol. 10–13 + 15). */
  totalExpenses: number;
  profit: number;
}

/** Sumy kolumn KPiR okresu — ta sama reguła co dotąd w `KpirView`. */
export function kpirTotals(expenses: readonly KpirExpenseRow[], invoices: readonly KpirInvoiceRow[]): KpirTotals {
  const column = (col: string) => expenses
    .filter((e) => e.kpir_column === col)
    .reduce((s, e) => s + kpirCostAmount(e), 0);
  const sums = {
    col_7: invoices.reduce((s, i) => s + kpirInvoiceRevenue(i), 0),
    col_8: 0,
    col_10: column('col_10'),
    col_11: column('col_11'),
    col_12: column('col_12'),
    col_13: column('col_13'),
    col_15: column('col_15'),
  };
  const totalRevenue = sums.col_7 + sums.col_8;
  const totalExpenses = sums.col_10 + sums.col_11 + sums.col_12 + sums.col_13 + sums.col_15;
  return { ...sums, totalRevenue, totalExpenses, profit: totalRevenue - totalExpenses };
}
