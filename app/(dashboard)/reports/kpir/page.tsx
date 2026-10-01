import { KpirView } from '@/components/expenses/kpir-view';
import { assertOutgoingInvoicesInPln } from '@/lib/exports/currency-guard';
import { assertKsefExpensesReadyForPln } from '@/lib/expenses/ksef-currency-review';
import { fetchSettledAdvancesNet } from '@/lib/invoices/settled-advances';
import { getPageContext } from '@/lib/supabase/page-context';

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

  const now = new Date();
  const month = clampMonth(Number(sp.month ?? now.getMonth() + 1));
  const year = clampYear(Number(sp.year ?? now.getFullYear()), now.getFullYear());

  const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_deductible', true)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  let currencyError: string | null = null;
  if (!expensesError) {
    try {
      await assertKsefExpensesReadyForPln(expenses ?? [], async (ids) => {
        const { data, error } = await supabase
          .from('invoices')
          .select('id, currency')
          .eq('tenant_id', tenantId)
          .in('id', ids);
        if (error) throw new Error('Nie można sprawdzić walut faktur KSeF');
        return new Map((data ?? []).map((row) => [row.id, row.currency]));
      });
    } catch (error) {
      currencyError = error instanceof Error ? error.message : 'Nie można potwierdzić walut kosztów KSeF';
    }
  }

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, sale_date, gross_total, net_total, buyer_data, invoice_kind, advance_invoice_ids, currency',
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  let outgoingCurrencyError: string | null = null;
  if (!invoicesError) {
    try {
      assertOutgoingInvoicesInPln(invoices ?? []);
    } catch (error) {
      outgoingCurrencyError = error instanceof Error ? error.message : 'Nie można potwierdzić walut sprzedaży';
    }
  }

  // ROZ niesie pełną wartość zamówienia — przychód liczy tylko resztę ponad
  // zaliczki, które KPiR już ma (`kpirRevenueNet`). Bez tej sumy przychód
  // z ROZ byłby zawyżony — błąd idzie na baner nad tabelą, jak inne błędy odczytu.
  let settledError: string | null = null;
  let settled = new Map<string, number>();
  if (!invoicesError && !outgoingCurrencyError) {
    try {
      settled = await fetchSettledAdvancesNet(supabase, tenantId, invoices ?? []);
    } catch (e) {
      settledError = e instanceof Error ? e.message : 'Nie można odczytać zaliczek';
    }
  }
  const invoiceRows = (invoices ?? []).map((inv) => ({
    ...inv,
    settled_advances_net: settled.get(inv.id) ?? null,
  }));

  const loadError =
    expensesError?.message ?? currencyError ?? invoicesError?.message ?? outgoingCurrencyError ?? settledError ?? null;

  return (
    <div className="space-y-6 pb-10 text-[var(--ff-on-surface)]">
      {loadError ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] border border-red-400/25 bg-[color-mix(in_srgb,#f87171_10%,transparent)] p-4 text-sm text-red-200">
          {loadError}
        </div>
      ) : null}
      {!loadError ? (
        <KpirView
          month={month}
          year={year}
          expenses={expenses ?? []}
          invoices={invoiceRows}
        />
      ) : null}
    </div>
  );
}
