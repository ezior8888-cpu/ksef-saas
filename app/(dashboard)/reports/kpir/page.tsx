import { KpirView } from '@/components/expenses/kpir-view';
import { getPageContext } from '@/lib/supabase/page-context';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import {
  assertAcceptedInvoiceEnvironmentComplete,
  assertOutgoingCorrectionsReconciled,
  CorrectionReconciliationError,
  isUnreconciledCorrectionRow,
} from '@/lib/ksef/accounting-provenance';
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

async function renderKpirPage({
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

  const invoices = await readCompletePages('invoices', (from, to) => supabase
    .from('invoices')
    .select('id, internal_number, issue_date, gross_total, net_total, buyer_data, invoice_kind, invoice_type', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('ksef_environment', environment)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('id', { ascending: true })
    .range(from, to));
  await assertOutgoingCorrectionsReconciled(supabase, {
    tenantId, periodStart, periodEnd, endBound: 'inclusive', environment,
  });
  if (invoices.some(isUnreconciledCorrectionRow)) {
    throw new CorrectionReconciliationError();
  }
  invoices.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));

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

export default async function KpirPage(props: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  try {
    return await renderKpirPage(props);
  } catch (error) {
    if (!(error instanceof CorrectionReconciliationError)) throw error;
    return (
      <section role="alert" className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-6">
        <h1 className="font-semibold">Kwoty wymagają uzgodnienia</h1>
        <p>W tym okresie są korekty faktur. Raport KPiR jest wstrzymany do uzgodnienia ich kwot.</p>
      </section>
    );
  }
}
