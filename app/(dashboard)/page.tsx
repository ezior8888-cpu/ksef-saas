import { redirect } from 'next/navigation';

import { CashFlowDashboard } from '@/components/expenses/cash-flow-dashboard';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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

  const tenantId = userTenant.tenant_id;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('issue_date, net_total, gross_total')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .gte('issue_date', sixMonthsAgo)
    .order('issue_date', { ascending: true });

  const { data: expenses } = await supabase
    .from('expenses')
    .select('issue_date, net_amount, gross_amount, kpir_column')
    .eq('tenant_id', tenantId)
    .eq('is_deductible', true)
    .gte('issue_date', sixMonthsAgo)
    .order('issue_date', { ascending: true });

  const { count: pendingReviewCount } = await supabase
    .from('expenses')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_reviewed', false);

  return (
    <CashFlowDashboard
      invoices={invoices ?? []}
      expenses={expenses ?? []}
      pendingReviewCount={pendingReviewCount ?? 0}
    />
  );
}
