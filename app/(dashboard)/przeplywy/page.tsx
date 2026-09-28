import { MonthlyFiguresCard } from '@/components/dashboard/monthly-figures-card';
import { SalesChartCard } from '@/components/dashboard/sales-chart-card';
import { VatSummaryCard } from '@/components/dashboard/vat-summary-card';
import { CashFlowDashboard } from '@/components/expenses/cash-flow-dashboard';
import { filterExpensesForKsefEnvironment } from '@/lib/expenses/ksef-environment';
import {
  formatPlMoney,
  getMonthlyFigures,
  getSalesSeries,
} from '@/lib/dashboard/monthly-figures';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Od 30.08.2026 stoją tu też podsumowanie VAT i wykres sprzedaży, przeniesione
 * z dashboardu, który oddał całą powierzchnię agentowi FLO.
 *
 * Kwoty w podsumowaniu VAT i na wykresie sprzedaży pochodzą wyłącznie
 * z faktur przyjętych w aktywnym środowisku KSeF. Szkice lokalne mają
 * oddzielny licznik, a kolejki bez potwierdzonej proweniencji nie powiększają
 * wartości podatkowych.
 */
export const dynamic = 'force-dynamic';

export default async function PrzeplywyPage() {
  const { supabase, tenantId } = await getPageContext();
  const environment = requireConfiguredKsefEnvironment();

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);

  const [invoices, expenses] = await Promise.all([
    readCompletePages('cash-flow invoices', (from, to) =>
      supabase
        .from('invoices')
        .select('id, issue_date, net_total, gross_total', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('direction', 'outgoing')
        .eq('ksef_status', 'accepted')
        .eq('ksef_environment', environment)
        .gte('issue_date', sixMonthsAgo)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readCompletePages('cash-flow expenses', (from, to) =>
      supabase
        .from('expenses')
        .select('id, source, ksef_invoice_id, issue_date, net_amount, gross_amount, vat_amount, vat_deductible_amount, document_type, kpir_column', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('is_deductible', true)
        .gte('issue_date', sixMonthsAgo)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  const visibleExpenses = await filterExpensesForKsefEnvironment(
    supabase, tenantId, environment, expenses,
  );
  invoices.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));
  visibleExpenses.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));

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
      {/* Liczby miesiąca stoją na komputerze w prawej szynie dashboardu.
          Na telefonie szyny nie ma, a dolna nawigacja prowadzi tutaj pod
          nazwą „Miesiąc” — więc tu jest ich drugi (i na telefonie jedyny)
          adres. Od `lg` byłyby dublem szyny, stąd `lg:hidden`. */}
      <div className="lg:hidden">
        <MonthlyFiguresCard figures={figures} />
      </div>

      <CashFlowDashboard
        invoices={invoices}
        expenses={visibleExpenses}
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
