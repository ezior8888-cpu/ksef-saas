import { KpirView } from '@/components/expenses/kpir-view';
import { fetchSettledAdvancesNet } from '@/lib/invoices/settled-advances';
import { getPageContext } from '@/lib/supabase/page-context';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { assertAcceptedInvoiceEnvironmentComplete } from '@/lib/ksef/accounting-provenance';

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

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_deductible', true)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, sale_date, gross_total, net_total, buyer_data, invoice_kind, advance_invoice_ids',
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('ksef_environment', environment)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  // ROZ niesie pełną wartość zamówienia — przychód liczy tylko resztę ponad
  // zaliczki, które KPiR już ma (`kpirRevenueNet`). Bez tej sumy przychód
  // z ROZ byłby zawyżony — błąd idzie na baner nad tabelą, jak inne błędy odczytu.
  let settledError: string | null = null;
  let settled = new Map<string, number>();
  try {
    settled = await fetchSettledAdvancesNet(supabase, tenantId, invoices ?? []);
  } catch (e) {
    settledError = e instanceof Error ? e.message : 'Nie można odczytać zaliczek';
  }
  const invoiceRows = (invoices ?? []).map((inv) => ({
    ...inv,
    settled_advances_net: settled.get(inv.id) ?? null,
  }));

  const loadError =
    expensesError?.message ?? invoicesError?.message ?? settledError ?? null;

  return (
    <div className="space-y-6 pb-10 text-[var(--ff-on-surface)]">
      {loadError ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] border border-red-400/25 bg-[color-mix(in_srgb,#f87171_10%,transparent)] p-4 text-sm text-red-200">
          {loadError}
        </div>
      ) : null}
      <KpirView
        month={month}
        year={year}
        expenses={expenses ?? []}
        invoices={invoiceRows}
      />
    </div>
  );
}
