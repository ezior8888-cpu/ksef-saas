import { KpirView } from '@/components/expenses/kpir-view';
import { getPageContext } from '@/lib/supabase/page-context';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { assertAcceptedInvoiceEnvironmentComplete } from '@/lib/ksef/accounting-provenance';
import { filterExpensesForKsefEnvironment } from '@/lib/expenses/ksef-environment';
import { readCompletePages } from '@/lib/supabase/read-complete-pages';

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
    .order('issue_date', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to));
  const visibleExpenses = await filterExpensesForKsefEnvironment(
    supabase, tenantId, environment, expenses,
  );

  const invoices = await readCompletePages('invoices', (from, to) => supabase
    .from('invoices')
    .select('id, internal_number, issue_date, gross_total, net_total, buyer_data', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('ksef_environment', environment)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to));

  return (
    <div className="space-y-6 pb-10 text-[var(--ff-on-surface)]">
      <KpirView
        month={month}
        year={year}
        expenses={visibleExpenses}
        invoices={invoices}
      />
    </div>
  );
}
