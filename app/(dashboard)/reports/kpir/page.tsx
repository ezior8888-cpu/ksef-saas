import { KpirView } from '@/components/expenses/kpir-view';
import { assertOutgoingInvoicesInPln } from '@/lib/exports/currency-guard';
import { assertKsefExpensesReadyForPln } from '@/lib/expenses/ksef-currency-review';
import { fetchSettledAdvancesNet } from '@/lib/invoices/settled-advances';
import { getPageContext } from '@/lib/supabase/page-context';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { assertAcceptedInvoiceEnvironmentComplete } from '@/lib/ksef/accounting-provenance';
import { filterExpensesForKsefEnvironment } from '@/lib/expenses/ksef-environment';
import { readCompletePages } from '@/lib/accounting/read-complete-pages';

export const dynamic = 'force-dynamic';

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

export default async function KpirPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getPageContext();
  const environment = requireConfiguredKsefEnvironment();

  const now = new Date();
  const month = clampMonth(Number(sp.month ?? now.getMonth() + 1));
  const year = clampYear(Number(sp.year ?? now.getFullYear()), now.getFullYear());

  const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);

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
  const invoiceRows = invoices.map((inv) => ({
    ...inv,
    settled_advances_net: settled.get(inv.id) ?? null,
  }));

  return (
    <div className="space-y-6 pb-10 text-[var(--ff-on-surface)]">
      {currencyBlocked ?? settledError ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] border border-red-400/25 bg-[color-mix(in_srgb,#f87171_10%,transparent)] p-4 text-sm text-red-200">
          {currencyBlocked ?? settledError}
        </div>
      ) : null}
      {!currencyBlocked ? (
        <KpirView
          month={month}
          year={year}
          expenses={visibleExpenses}
          invoices={invoiceRows}
        />
      ) : null}
    </div>
  );
}
