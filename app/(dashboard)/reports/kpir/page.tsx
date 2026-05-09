import { KpirView } from '@/components/expenses/kpir-view';
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

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, internal_number, issue_date, gross_total, net_total, buyer_data')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  const loadError = expensesError?.message ?? invoicesError?.message ?? null;

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
        invoices={invoices ?? []}
      />
    </div>
  );
}
