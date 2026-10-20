import { RiFileEditLine, RiPercentLine, RiReceiptLine } from '@remixicon/react';

import { costCategoryBreakdown, costMonthStats, costOfMonth, costTrend, costVatSummary, recentCosts } from '@/lib/analytics-finance/costs';
import { dailyTotals } from '@/lib/analytics-finance/breakdown';
import { HEATMAP_DAYS, isoDatePl, monthKeysEnding, shiftMonthKey, TREND_MONTHS, currentMonthKey } from '@/lib/analytics-finance/months';
import { RECURRING_MONTHS, recurringSuppliers } from '@/lib/analytics-finance/recurring';
import { salesOfMonth } from '@/lib/analytics-finance/sales';
import type { CostEntry } from '@/lib/dashboard/costs';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { formatPlMoney } from '@/lib/format/pl';
import { countLabel } from '@/lib/i18n/plural';

import { AnalizySlot, loadAnalizyCard, type AnalizyCardProps } from './card-slot';
import CategoryBreakdownChart from './finora/category-breakdown-chart';
import CategoryRankedList from './finora/category-ranked-list';
import { ANALIZY_EMPTY, type EmptyStateProps } from './finora/empty';
import IncomeExpenseSummary from './finora/income-expense-summary';
import { CostStatsCards } from './finora/monthly-stats-cards';
import RecentExpensesFeed from './finora/recent-expenses-feed';
import SpendHeatmap from './finora/spend-heatmap';
import SpendTrendChart from './finora/spend-trend-chart';
import SpendingStreaksCard from './finora/spending-streaks-card';
import SubscriptionsCard from './finora/subscriptions-card';
import { loadCostsWindow, loadKsefVerified, loadSalesWindow } from './loaders';

/**
 * Analiza kosztów `/analizy/koszty` (plan Finora P10 ← Finora
 * `money-management/monthly-analytics/index.tsx`, siatka 1:1:
 * `grid gap-6 md:grid-cols-4`). Każda karta osobno w `Suspense`
 * + `SectionErrorBoundary` (§2.4 pkt 15); koszty jedną drogą `getCosts`
 * (§2.4 pkt 12), czytane raz na żądanie (`loadCostsWindow`).
 */

type CardProps = AnalizyCardProps & { className?: string };

/** Pusty miesiąc: firma bez KSeF i bez żadnych wydatków dostaje „Podłącz KSeF” (§7.3). */
async function costsEmpty(entries: readonly CostEntry[]): Promise<EmptyStateProps> {
  if (entries.length > 0) return ANALIZY_EMPTY.noCostsThisMonth;
  return (await loadKsefVerified()) ? ANALIZY_EMPTY.noCostsThisMonth : ANALIZY_EMPTY.connectKsef;
}

export async function CostStatsSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Wydatki miesiąca', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const stats = costMonthStats(entries, month, shiftMonthKey(month, -1), todayInWarsaw(new Date(nowIso)));
    return <CostStatsCards stats={stats} className={className} />;
  });
}

export async function CostTrendSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Trend wydatków', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const keys = monthKeysEnding(currentMonthKey(new Date(nowIso)), TREND_MONTHS);
    return (
      <SpendTrendChart
        title="Trend wydatków"
        description="Wydatki brutto w ostatnich 6 miesiącach"
        seriesLabel="Wydatki"
        data={costTrend(entries, keys)}
        empty={entries.length === 0 ? await costsEmpty(entries) : ANALIZY_EMPTY.noCostsInTrend}
        className={className}
      />
    );
  });
}

export async function CostCategoriesChartSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Wydatki według kategorii', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    return (
      <CategoryBreakdownChart
        title="Wydatki według kategorii"
        description="Udział w wydatkach wybranego miesiąca"
        data={costCategoryBreakdown(entries, month)}
        empty={await costsEmpty(entries)}
        className={className}
      />
    );
  });
}

export async function CostCategoriesListSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Największe kategorie', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    return (
      <CategoryRankedList
        title="Największe kategorie"
        description="Według kwoty wydanej w wybranym miesiącu"
        data={costCategoryBreakdown(entries, month)}
        kind="category"
        empty={await costsEmpty(entries)}
        className={className}
      />
    );
  });
}

export async function RecentCostsSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Ostatnie wydatki', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    return (
      <RecentExpensesFeed
        title="Ostatnie wydatki"
        description="Najnowsze wydatki z wybranego miesiąca"
        items={recentCosts(entries, month).map((c) => ({ id: c.id, name: c.name, subtitle: isoDatePl(c.date), amount: c.amount }))}
        direction="out"
        empty={await costsEmpty(entries)}
        className={className}
      />
    );
  });
}

export async function CostVatSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('VAT z wydatków', className, async () => {
    const vat = costVatSummary(await loadCostsWindow(supabase, tenantId, nowIso), month);
    return (
      <SpendingStreaksCard
        title="VAT z wydatków"
        description="Wybrany miesiąc · VAT do odliczenia według rodzaju dokumentu"
        className={className}
        rows={[
          { icon: RiReceiptLine, iconClassName: 'text-foreground', title: 'VAT naliczony', value: `${formatPlMoney(vat.vat)} zł` },
          { icon: RiPercentLine, iconClassName: 'text-primary', title: 'VAT do odliczenia', value: `${formatPlMoney(vat.vatDeductible)} zł` },
          {
            icon: RiFileEditLine,
            iconClassName: vat.toReview > 0 ? 'text-destructive' : 'text-foreground',
            title: 'Do opisania',
            value: countLabel(vat.toReview, ['dokument', 'dokumenty', 'dokumentów']),
          },
        ]}
      />
    );
  });
}

export async function CostIncomeExpenseSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Przychody a koszty', className, async () => {
    const [sales, costs] = await Promise.all([
      loadSalesWindow(supabase, tenantId, nowIso),
      loadCostsWindow(supabase, tenantId, nowIso),
    ]);
    return <IncomeExpenseSummary income={salesOfMonth(sales, month)} expense={costOfMonth(costs, month)} className={className} />;
  });
}

export async function RecurringCostsSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Stałe koszty', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const months = monthKeysEnding(currentMonthKey(new Date(nowIso)), RECURRING_MONTHS);
    return (
      <SubscriptionsCard
        title="Stałe koszty"
        description="Dostawcy z wydatkami w 3 z 4 ostatnich miesięcy"
        items={recurringSuppliers(entries, months)}
        empty={ANALIZY_EMPTY.noRecurringSuppliers}
        className={className}
      />
    );
  });
}

export async function CostHeatmapSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Kalendarz wydatków', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const days = dailyTotals(entries, (e) => e.issueDate, (e) => e.outflow, todayInWarsaw(new Date(nowIso)), HEATMAP_DAYS);
    return (
      <SpendHeatmap
        title="Kalendarz wydatków"
        description={`Ostatnie ${HEATMAP_DAYS} dni — ciemniejsze pole to więcej wydanych pieniędzy`}
        days={days}
        empty={entries.length === 0 ? await costsEmpty(entries) : ANALIZY_EMPTY.noCostsInWindow}
        className={className}
      />
    );
  });
}

export function KosztyGrid(props: AnalizyCardProps) {
  return (
    <div className="grid gap-6 md:grid-cols-4">
      <AnalizySlot title="Wydatki miesiąca" variant="tile" className="md:col-span-4">
        <CostStatsSlot {...props} className="md:col-span-4" />
      </AnalizySlot>
      <AnalizySlot title="Trend wydatków" variant="chart" className="md:col-span-2 2xl:col-span-3">
        <CostTrendSlot {...props} className="md:col-span-2 2xl:col-span-3" />
      </AnalizySlot>
      <AnalizySlot title="Wydatki według kategorii" variant="chart" className="md:max-2xl:col-span-2">
        <CostCategoriesChartSlot {...props} className="md:max-2xl:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Największe kategorie" variant="list" className="md:col-span-2">
        <CostCategoriesListSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Ostatnie wydatki" variant="list" className="md:col-span-2">
        <RecentCostsSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="VAT z wydatków" variant="list" className="md:col-span-2">
        <CostVatSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Przychody a koszty" variant="list" className="md:col-span-2">
        <CostIncomeExpenseSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Stałe koszty" variant="list" className="md:col-span-2">
        <RecurringCostsSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Kalendarz wydatków" variant="chart" className="md:col-span-2">
        <CostHeatmapSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
    </div>
  );
}
