import { SalesChartCard } from '@/components/dashboard/sales-chart-card';
import { VatSummaryCard } from '@/components/dashboard/vat-summary-card';
import { CashFlowDashboard } from '@/components/expenses/cash-flow-dashboard';
import {
  formatPlMoney,
  getMonthlyFigures,
  getSalesSeries,
} from '@/lib/dashboard/monthly-figures';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Od 30.08.2026 stoją tu też podsumowanie VAT i wykres sprzedaży, przeniesione
 * z dashboardu, który oddał całą powierzchnię agentowi FLO.
 *
 * Zapytania celowo NIE są łączone z tymi wyżej: `CashFlowDashboard` liczy
 * przepływ, więc bierze wyłącznie faktury PRZYJĘTE przez KSeF
 * (`ksef_status = 'accepted'`), a podsumowanie VAT i wykres sprzedaży mają
 * pokazywać wszystko, co zostało wystawione. Sklejenie tych filtrów zaniżyłoby
 * VAT o faktury czekające w kolejce.
 */
export const dynamic = 'force-dynamic';

export default async function PrzeplywyPage() {
  const { supabase, tenantId } = await getPageContext();

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

  const [figures, series] = await Promise.all([
    getMonthlyFigures(supabase, tenantId, now),
    getSalesSeries(supabase, tenantId, now),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <CashFlowDashboard
        invoices={invoices ?? []}
        expenses={expenses ?? []}
        pendingReviewCount={pendingReviewCount ?? 0}
      />

      <VatSummaryCard
        monthName={figures.monthName}
        netLabel={formatPlMoney(figures.totalNet)}
        vatLabel={formatPlMoney(figures.totalVat)}
        grossLabel={formatPlMoney(figures.totalGross)}
        vatDueLabel={figures.vatDueLabel}
        daysToVatDue={figures.daysToVatDue}
      />

      <SalesChartCard
        months={series.months}
        currentSeries={series.currentSeries}
        prevSeries={series.prevSeries}
        currentMonthKey={series.currentMonthKey}
        year={now.getFullYear()}
      />
    </div>
  );
}
