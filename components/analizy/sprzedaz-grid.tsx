import { RiAlarmWarningLine, RiHourglassLine, RiMoneyDollarCircleLine } from '@remixicon/react';

import { dailyTotals } from '@/lib/analytics-finance/breakdown';
import { clientMovers, clientShares, saleBuyerName } from '@/lib/analytics-finance/clients';
import { costOfMonth } from '@/lib/analytics-finance/costs';
import {
  currentMonthKey,
  HEATMAP_DAYS,
  isoDatePl,
  monthKeysEnding,
  shiftMonthKey,
  TREND_MONTHS,
} from '@/lib/analytics-finance/months';
import { productBreakdown } from '@/lib/analytics-finance/products';
import { RECURRING_MONTHS, recurringClients } from '@/lib/analytics-finance/recurring';
import { recentSales, salesMonthStats, salesOfMonth, salesTrend, type SaleInvoice } from '@/lib/analytics-finance/sales';
import { PRODUCTS_NOTE } from '@/lib/dashboard/rankings';
import { RECEIVABLES_NOTE } from '@/lib/dashboard/receivables';
import { formatPlMoney } from '@/lib/format/pl';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { countLabel, plural } from '@/lib/i18n/plural';

import { AnalizySlot, loadAnalizyCard, type AnalizyCardProps } from './card-slot';
import CategoryBreakdownChart from './finora/category-breakdown-chart';
import CategoryRankedList from './finora/category-ranked-list';
import AssetAllocationCard from './finora/chart-asset-allocation';
import { ANALIZY_EMPTY, type EmptyStateProps } from './finora/empty';
import IncomeExpenseSummary from './finora/income-expense-summary';
import { SalesStatsCards } from './finora/monthly-stats-cards';
import MoverListCard from './finora/mover-list-card';
import RecentExpensesFeed from './finora/recent-expenses-feed';
import SpendHeatmap from './finora/spend-heatmap';
import SpendTrendChart from './finora/spend-trend-chart';
import SpendingStreaksCard from './finora/spending-streaks-card';
import SubscriptionsCard from './finora/subscriptions-card';
import { loadCostsWindow, loadProductLines, loadReceivables, loadSalesWindow } from './loaders';

/**
 * Analiza sprzedaży `/analizy/sprzedaz` (plan Finora P11 ← Monthly
 * Analytics drugi raz, ten sam układ co P10) + rząd 3 × 1/3 pod siatką:
 * „Udział klientów w przychodach” (Asset Allocation z Net Worth) | „Klienci:
 * rośnie” | „Klienci: spada” (Top Gainers / Top Losers, siatka jak
 * `investments/equities`). Faktury jednym odczytem `getSalesInvoices`
 * (§2.4 pkt 2, 4–7), produkty `fetchProductLines` (§2.4 pkt 13), należności
 * `getReceivables` (§2.4 pkt 11). Każda karta osobno w `Suspense`
 * + `SectionErrorBoundary` (§2.4 pkt 15).
 */

type CardProps = AnalizyCardProps & { className?: string };

/** Pusty miesiąc: bez żadnej faktury w oknie — „wystaw pierwszą fakturę” (§7.3). */
function salesEmpty(invoices: readonly SaleInvoice[]): EmptyStateProps {
  return invoices.length === 0 ? ANALIZY_EMPTY.noInvoices : ANALIZY_EMPTY.noSalesThisMonth;
}

const inMonth = (invoices: readonly SaleInvoice[], month: string) =>
  invoices.filter((inv) => inv.issueDate.slice(0, 7) === month);

export async function SalesStatsSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Sprzedaż miesiąca', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    return <SalesStatsCards stats={salesMonthStats(invoices, month, shiftMonthKey(month, -1))} className={className} />;
  });
}

export async function SalesTrendSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Trend sprzedaży', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    const keys = monthKeysEnding(currentMonthKey(new Date(nowIso)), TREND_MONTHS);
    return (
      <SpendTrendChart
        title="Trend sprzedaży"
        description="Sprzedaż netto w ostatnich 6 miesiącach"
        seriesLabel="Sprzedaż netto"
        data={salesTrend(invoices, keys)}
        empty={invoices.length === 0 ? ANALIZY_EMPTY.noInvoices : ANALIZY_EMPTY.noSalesInTrend}
        className={className}
      />
    );
  });
}

export async function ProductsChartSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Sprzedaż według produktów', className, async () => {
    const [lines, invoices] = await Promise.all([
      loadProductLines(supabase, tenantId, month),
      loadSalesWindow(supabase, tenantId, nowIso),
    ]);
    const data = productBreakdown(lines);
    return (
      <CategoryBreakdownChart
        title="Sprzedaż według produktów"
        description={`${PRODUCTS_NOTE} · wybrany miesiąc`}
        data={data}
        empty={inMonth(invoices, month).length === 0 ? salesEmpty(invoices) : ANALIZY_EMPTY.noProducts}
        className={className}
      />
    );
  });
}

export async function ProductsListSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Najlepsze produkty i usługi', className, async () => {
    const [lines, invoices] = await Promise.all([
      loadProductLines(supabase, tenantId, month),
      loadSalesWindow(supabase, tenantId, nowIso),
    ]);
    return (
      <CategoryRankedList
        title="Najlepsze produkty i usługi"
        description={`${PRODUCTS_NOTE} · netto`}
        data={productBreakdown(lines)}
        kind="product"
        empty={inMonth(invoices, month).length === 0 ? salesEmpty(invoices) : ANALIZY_EMPTY.noProducts}
        className={className}
      />
    );
  });
}

export async function RecentSalesSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Ostatnie faktury', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    return (
      <RecentExpensesFeed
        title="Ostatnie faktury"
        description="Najnowsze faktury przyjęte w KSeF w wybranym miesiącu · brutto"
        items={recentSales(invoices, month, saleBuyerName).map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: s.number ? `${s.number} · ${isoDatePl(s.date)}` : isoDatePl(s.date),
          amount: s.amount,
        }))}
        direction="in"
        empty={salesEmpty(invoices)}
        className={className}
      />
    );
  });
}

export async function ReceivablesSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Należności', className, async () => {
    const r = await loadReceivables(supabase, tenantId, nowIso);
    const skipped = r.foreignCurrencyCount > 0
      ? ` · pominięto ${r.foreignCurrencyCount} ${plural(r.foreignCurrencyCount, ['fakturę', 'faktury', 'faktur'])} w walucie obcej`
      : '';
    return (
      <SpendingStreaksCard
        title="Należności"
        description={`${RECEIVABLES_NOTE}${skipped}`}
        className={className}
        rows={[
          {
            icon: RiMoneyDollarCircleLine,
            iconClassName: 'text-foreground',
            title: 'Do zapłaty',
            value: `${formatPlMoney(r.total)} zł · ${countLabel(r.count, ['faktura', 'faktury', 'faktur'])}`,
          },
          {
            icon: RiAlarmWarningLine,
            iconClassName: r.overdue > 0 ? 'text-destructive' : 'text-foreground',
            title: 'Po terminie',
            value: `${formatPlMoney(r.overdue)} zł · ${countLabel(r.overdueCount, ['faktura', 'faktury', 'faktur'])}`,
          },
          {
            icon: RiHourglassLine,
            iconClassName: 'text-foreground',
            title: 'Najstarsza zaległość',
            value: r.oldestOverdueDays === null
              ? 'Brak zaległości'
              : countLabel(r.oldestOverdueDays, ['dzień', 'dni', 'dni']),
          },
        ]}
      />
    );
  });
}

export async function SalesIncomeExpenseSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Przychody a koszty', className, async () => {
    const [sales, costs] = await Promise.all([
      loadSalesWindow(supabase, tenantId, nowIso),
      loadCostsWindow(supabase, tenantId, nowIso),
    ]);
    return <IncomeExpenseSummary income={salesOfMonth(sales, month)} expense={costOfMonth(costs, month)} className={className} />;
  });
}

export async function RecurringClientsSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Stali klienci', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    const months = monthKeysEnding(currentMonthKey(new Date(nowIso)), RECURRING_MONTHS);
    return (
      <SubscriptionsCard
        title="Stali klienci"
        description="Nabywcy z fakturą w 3 z 4 ostatnich miesięcy · netto"
        items={recurringClients(invoices, months)}
        empty={ANALIZY_EMPTY.noRecurringClients}
        className={className}
      />
    );
  });
}

export async function SalesHeatmapSlot({ supabase, tenantId, nowIso, className }: CardProps) {
  return loadAnalizyCard('Kalendarz sprzedaży', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    const days = dailyTotals(invoices, (inv) => inv.issueDate, (inv) => inv.net, todayInWarsaw(new Date(nowIso)), HEATMAP_DAYS);
    return (
      <SpendHeatmap
        title="Kalendarz sprzedaży"
        description={`Ostatnie ${HEATMAP_DAYS} dni — ciemniejsze pole to większa sprzedaż netto`}
        days={days}
        empty={invoices.length === 0 ? ANALIZY_EMPTY.noInvoices : ANALIZY_EMPTY.noSalesInWindow}
        className={className}
      />
    );
  });
}

export async function ClientSharesSlot({ supabase, tenantId, nowIso, month, className }: CardProps) {
  return loadAnalizyCard('Udział klientów w przychodach', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    const shares = clientShares(inMonth(invoices, month));
    return (
      <AssetAllocationCard data={shares.slices} concentrated={shares.concentrated} empty={salesEmpty(invoices)} className={className} />
    );
  });
}

/** Okno „rośnie / spada”: 3 miesiące z bieżącym wobec 3 poprzednich. */
function moversWindow(nowIso: string) {
  const current = currentMonthKey(new Date(nowIso));
  return {
    prevFrom: `${shiftMonthKey(current, -5)}-01`,
    currentFrom: `${shiftMonthKey(current, -2)}-01`,
    toExclusive: `${shiftMonthKey(current, 1)}-01`,
  };
}

export async function ClientMoversSlot({
  supabase,
  tenantId,
  nowIso,
  mode,
  className,
}: CardProps & { mode: 'gainers' | 'losers' }) {
  return loadAnalizyCard(mode === 'gainers' ? 'Klienci: rośnie' : 'Klienci: spada', className, async () => {
    const invoices = await loadSalesWindow(supabase, tenantId, nowIso);
    const movers = clientMovers(invoices, moversWindow(nowIso));
    return (
      <MoverListCard
        mode={mode}
        items={mode === 'gainers' ? movers.gainers : movers.losers}
        empty={invoices.length === 0 ? ANALIZY_EMPTY.noInvoices : mode === 'gainers' ? ANALIZY_EMPTY.noGainers : ANALIZY_EMPTY.noLosers}
        className={className}
      />
    );
  });
}

const THIRD = 'col-span-full md:col-span-3 lg:col-span-2';

export function SprzedazGrid(props: AnalizyCardProps) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        <AnalizySlot title="Sprzedaż miesiąca" variant="tile" className="md:col-span-4">
          <SalesStatsSlot {...props} className="md:col-span-4" />
        </AnalizySlot>
        <AnalizySlot title="Trend sprzedaży" variant="chart" className="md:col-span-2 2xl:col-span-3">
          <SalesTrendSlot {...props} className="md:col-span-2 2xl:col-span-3" />
        </AnalizySlot>
        <AnalizySlot title="Sprzedaż według produktów" variant="chart" className="md:max-2xl:col-span-2">
          <ProductsChartSlot {...props} className="md:max-2xl:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Najlepsze produkty i usługi" variant="list" className="md:col-span-2">
          <ProductsListSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Ostatnie faktury" variant="list" className="md:col-span-2">
          <RecentSalesSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Należności" variant="list" className="md:col-span-2">
          <ReceivablesSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Przychody a koszty" variant="list" className="md:col-span-2">
          <SalesIncomeExpenseSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Stali klienci" variant="list" className="md:col-span-2">
          <RecurringClientsSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
        <AnalizySlot title="Kalendarz sprzedaży" variant="chart" className="md:col-span-2">
          <SalesHeatmapSlot {...props} className="md:col-span-2" />
        </AnalizySlot>
      </div>

      <div className="grid grid-cols-6 gap-6">
        <AnalizySlot title="Udział klientów w przychodach" variant="chart" className={THIRD}>
          <ClientSharesSlot {...props} className={THIRD} />
        </AnalizySlot>
        <AnalizySlot title="Klienci: rośnie" variant="list" className={THIRD}>
          <ClientMoversSlot {...props} mode="gainers" className={THIRD} />
        </AnalizySlot>
        <AnalizySlot title="Klienci: spada" variant="list" className={THIRD}>
          <ClientMoversSlot {...props} mode="losers" className={THIRD} />
        </AnalizySlot>
      </div>
    </>
  );
}
