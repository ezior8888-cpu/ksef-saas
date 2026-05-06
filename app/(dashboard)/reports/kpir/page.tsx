import { redirect } from 'next/navigation';

import { KpirView } from '@/components/expenses/kpir-view';
import { createClient } from '@/lib/supabase/server';

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userTenant } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!userTenant?.tenant_id) redirect('/onboarding');

  const now = new Date();
  const month = clampMonth(Number(sp.month ?? now.getMonth() + 1));
  const year = clampYear(Number(sp.year ?? now.getFullYear()), now.getFullYear());

  const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', userTenant.tenant_id)
    .eq('is_deductible', true)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, internal_number, issue_date, gross_total, net_total, buyer_data')
    .eq('tenant_id', userTenant.tenant_id)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .order('issue_date', { ascending: true });

  const loadError = expensesError?.message ?? invoicesError?.message ?? null;

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
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
