import { costCategoryBreakdown, costMonthStats, costOfMonth, costTrend, costVatSummary } from '@/lib/analytics-finance/costs';
import { dailyTotals } from '@/lib/analytics-finance/breakdown';
import { HEATMAP_DAYS, monthKeysEnding, shiftMonthKey, TREND_MONTHS, currentMonthKey } from '@/lib/analytics-finance/months';
import { RECURRING_MONTHS, recurringSuppliers } from '@/lib/analytics-finance/recurring';
import { salesOfMonth } from '@/lib/analytics-finance/sales';
import type { CostEntry } from '@/lib/dashboard/costs';
import { todayInWarsaw } from '@/lib/format/warsaw-date';

import {
  costVatRows,
  incomeExpenseNet,
  isAllZero,
  RECURRING_LIST_LIMIT,
  recentCostItems,
  toCategorySlices,
  toRankedItems,
  toSubscriptionItems,
  toTrendData,
} from './adapters';
import { AnalizySlot, loadAnalizyCard, type AnalizyCardProps } from './card-slot';
import CategoryBreakdownChart from './finora-1do1/category-breakdown-chart';
import CategoryRankedList from './finora-1do1/category-ranked-list';
import { costCategoryIcon } from './finora-1do1/expense-category-icons';
import IncomeExpenseSummary from './finora-1do1/income-expense-summary';
import MonthlyStatsCards from './finora-1do1/monthly-stats-cards';
import RecentExpensesFeed from './finora-1do1/recent-expenses-feed';
import SpendHeatmap from './finora-1do1/spend-heatmap';
import SpendTrendChart from './finora-1do1/spend-trend-chart';
import SpendingStreaksCard from './finora-1do1/spending-streaks-card';
import SubscriptionsCard from './finora-1do1/subscriptions-card';
import { ANALIZY_EMPTY, type EmptyStateProps } from './finora/empty';
import { loadCostsWindow, loadKsefVerified, loadSalesWindow } from './loaders';

/**
 * Analiza kosztów `/analizy/koszty` — poprawka Bartosza 21.10.2026: Analizy
 * 1:1 z Finory (`money-management/monthly-analytics/index.tsx`). Siatka
 * `grid gap-6 md:grid-cols-4` z dziewięcioma kartami Monthly Analytics w tej
 * samej kolejności i z tymi samymi rozpiętościami; karty to kopie
 * z `finora-1do1/`, a dane — prawdziwe, przez czyste adaptery
 * (`./adapters`). Każda karta osobno w `Suspense` + `SectionErrorBoundary`
 * (§2.4 pkt 15); koszty jedną drogą `getCosts` (§2.4 pkt 12), czytane raz na
 * żądanie (`loadCostsWindow`).
 */

type CardProps = AnalizyCardProps & { className?: string };

/** Pusty miesiąc: firma bez KSeF i bez żadnych wydatków dostaje „Podłącz KSeF” (§7.3). */
async function costsEmpty(entries: readonly CostEntry[]): Promise<EmptyStateProps> {
  if (entries.length > 0) return ANALIZY_EMPTY.noCostsThisMonth;
  return (await loadKsefVerified()) ? ANALIZY_EMPTY.noCostsThisMonth : ANALIZY_EMPTY.connectKsef;
}

/**
 * Pusty stan kart całego okna (trend, kalendarz): tylko, gdy w oknie nie ma
 * ŻADNEGO wydatku — wtedy zera byłyby nieprawdą (świeża firma albo koszty
 * bez KSeF). Z choćby jednym wydatkiem wykres Finory rysuje się zawsze (`null`).
 */
async function costsWindowEmpty(
  entries: readonly CostEntry[],
  inWindow: EmptyStateProps,
): Promise<EmptyStateProps | null> {
  if (entries.length > 0) return null;
  return (await loadKsefVerified()) ? inWindow : ANALIZY_EMPTY.connectKsef;
}

export async function CostStatsSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Wydatki miesiąca', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const stats = costMonthStats(entries, month, shiftMonthKey(month, -1), todayInWarsaw(new Date(nowIso)));
    return (
      <MonthlyStatsCards
        stats={{
          totalSpend: stats.total,
          avgDailySpend: stats.avgDaily,
          vsLastMonthPercentage: stats.changePct,
          topCategory: stats.topCategory,
        }}
        labels={{
          totalSpend: 'Wydano (brutto)',
          avgDailySpend: 'Średnio dziennie',
          vsLastMonth: 'vs poprzedni miesiąc',
          topCategory: 'Największa kategoria',
          noPreviousMonth: 'Brak wydatków w poprzednim miesiącu',
        }}
        className={className}
      />
    );
  });
}

export async function CostTrendSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Trend wydatków', className, async () => {
    const entries = await loadCostsWindow(supabase, tenantId, nowIso);
    const data = toTrendData(costTrend(entries, monthKeysEnding(currentMonthKey(new Date(nowIso)), TREND_MONTHS)));
    // Słupki Finory zawsze, także z jednym miesiącem; pusto tylko, gdy wszystkie 6 to zero (D8).
    const empty = isAllZero(data)
      ? ((await costsWindowEmpty(entries, ANALIZY_EMPTY.noCostsInTrend)) ?? ANALIZY_EMPTY.noCostsInTrend)
      : null;
    return (
      <SpendTrendChart
        title="Trend wydatków"
        description="Wydatki brutto w ostatnich 6 miesiącach"
        seriesLabel="Wydatki"
        data={data}
        empty={empty}
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
        data={toCategorySlices(costCategoryBreakdown(entries, month))}
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
        data={toRankedItems(toCategorySlices(costCategoryBreakdown(entries, month)), (s) => costCategoryIcon(s.label))}
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
        data={recentCostItems(entries, month)}
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
        // Poprawka 21.10.2026: opis w jednej linii jak w Finorze (dłuższy zawijał
        // się przy 375 px i podnosił kartę o 19,5 px).
        description="Wybrany miesiąc · VAT do odliczenia według dokumentu"
        rows={costVatRows(vat)}
        className={className}
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
    return (
      <IncomeExpenseSummary data={incomeExpenseNet(salesOfMonth(sales, month), costOfMonth(costs, month))} className={className} />
    );
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
        data={toSubscriptionItems(recurringSuppliers(entries, months, RECURRING_LIST_LIMIT), 'supplier')}
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
        // Poprawka 21.10.2026: „mocniejszy kolor”, nie „ciemniejsze pole” — w ciemnym
        // motywie dzień z wydatkami jest JAŚNIEJSZY od pustego; i jedna linia jak w Finorze.
        description={`Ostatnie ${HEATMAP_DAYS} dni — mocniejszy kolor to więcej wydatków`}
        data={days}
        empty={await costsWindowEmpty(entries, ANALIZY_EMPTY.noCostsInWindow)}
        className={className}
      />
    );
  });
}

export function KosztyGrid(props: AnalizyCardProps) {
  return (
    <div className="grid gap-6 md:grid-cols-4">
      <AnalizySlot title="Wydatki miesiąca" variant="stats" className="md:col-span-4">
        <CostStatsSlot {...props} className="md:col-span-4" />
      </AnalizySlot>
      <AnalizySlot title="Trend wydatków" variant="bar" className="md:col-span-2 2xl:col-span-3">
        <CostTrendSlot {...props} className="md:col-span-2 2xl:col-span-3" />
      </AnalizySlot>
      <AnalizySlot title="Wydatki według kategorii" variant="pie" className="md:max-2xl:col-span-2">
        <CostCategoriesChartSlot {...props} className="md:max-2xl:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Największe kategorie" variant="list" className="md:col-span-2">
        <CostCategoriesListSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Ostatnie wydatki" variant="feed" className="md:col-span-2">
        <RecentCostsSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="VAT z wydatków" variant="rows" className="md:col-span-2">
        <CostVatSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Przychody a koszty" variant="rows" className="md:col-span-2">
        <CostIncomeExpenseSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Stałe koszty" variant="list" className="md:col-span-2">
        <RecurringCostsSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
      <AnalizySlot title="Kalendarz wydatków" variant="heatmap" className="md:col-span-2">
        <CostHeatmapSlot {...props} className="md:col-span-2" />
      </AnalizySlot>
    </div>
  );
}
