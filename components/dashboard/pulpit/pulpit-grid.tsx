import { cache, Suspense, type ReactNode } from 'react';
import { RiFileList3Line, RiMoneyDollarCircleLine } from '@remixicon/react';

import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';
import { getCosts, sumCostsByMonth } from '@/lib/dashboard/costs';
import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';
import { buildMonthReport } from '@/lib/dashboard/pulpit-report';
import { PRODUCTS_NOTE, getTopClients, getTopProducts } from '@/lib/dashboard/rankings';
import { getReceivables, RECEIVABLES_NOTE } from '@/lib/dashboard/receivables';
import { receivablesAging } from '@/lib/dashboard/receivables-aging';
import { getRecentInvoices } from '@/lib/dashboard/recent-invoices';
import { OutgoingInvoiceCurrencyNotSupportedError } from '@/lib/exports/currency-guard';
import { KsefExpenseCurrencyNotSupportedError } from '@/lib/expenses/ksef-currency-review';
import { formatPlCompactMoney, formatPlInt, formatPlMoney } from '@/lib/format/pl';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { plural } from '@/lib/i18n/plural';
import { isSubjectiveVatExemption, readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import type { PageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';
import { roundToCents } from '@/lib/xml/invoice-calculator';

import { PulpitCardError, PulpitCardSkeleton } from './card-states';
import { FinanceCard } from './finance-card';
import { NetRevenueCard } from './net-revenue-card';
import { ReceivablesAgingCard } from './receivables-aging-card';
import { RecentInvoicesCard } from './recent-invoices-card';
import { SalesYtdCard } from './sales-ytd-card';
import { StatTile } from './stat-tile';
import { TopListsCard } from './top-lists-card';
import { VatDueCard } from './vat-due-card';

/**
 * Siatka Pulpitu (plan Finora P1 ← Finora `dashboard/finance/page.tsx`,
 * siatka 1:1). Każda karta to osobny asynchroniczny Server Component
 * w `<Suspense>` + `SectionErrorBoundary` (§2.4 pkt 15): strażnik, który
 * rzuci (faktura w EUR, przyjęta faktura bez środowiska, niepełna strona),
 * zabiera JEDNĄ kartę z treścią wyjątku, a reszta Pulpitu i slot FLO działają.
 *
 * Treść wyjątku bierzemy w ładowarce (try/catch), bo granica błędu nie
 * przekazuje tekstu, a Next.js w produkcji ukrywa treść wyjątków serwerowych
 * (wzór: kafle listy faktur z E3). Granica zostaje siatką bezpieczeństwa na
 * błąd renderu.
 *
 * Karty, które czytają te same dane (seria sprzedaży, należności, liczby
 * miesiąca), biorą je przez `cache()` — jedno zapytanie na żądanie, a błąd
 * i tak trafia osobno do każdej karty, która z niego korzysta.
 */

export interface PulpitCardProps {
  supabase: PageContext['supabase'];
  tenantId: string;
  /** Chwila żądania jako ISO — jeden „teraz” dla wszystkich kart. */
  nowIso: string;
}

const SALES_MONTHS = 12;
const SHORT_MONTHS = 6;

const loadSalesSeries = cache((supabase: PageContext['supabase'], tenantId: string, nowIso: string) =>
  getSalesSeries(supabase, tenantId, new Date(nowIso), { months: SALES_MONTHS, withPrevYear: false }));

const loadMonthlyFigures = cache((supabase: PageContext['supabase'], tenantId: string, nowIso: string) =>
  getMonthlyFigures(supabase, tenantId, new Date(nowIso)));

const loadReceivables = cache((supabase: PageContext['supabase'], tenantId: string, nowIso: string) =>
  getReceivables(supabase, tenantId, new Date(nowIso)));

/** Pierwszy dzień miesiąca po kluczu RRRR-MM (arytmetyka UTC, bez strefy procesu). */
function nextMonthStart(monthKey: string): string {
  const d = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export const PULPIT_GENERIC_ERROR = 'Nie udało się wczytać karty. Odśwież stronę za chwilę.';

/** Polskie komunikaty strażników §2.4 i odczytów — te klient może przeczytać. */
const CUSTOMER_MESSAGE_PREFIXES = ['Nie można ', 'Przyjęte faktury ', 'Koszty ze skrzynki KSeF '];

/**
 * Treść wyjątku dla klienta. Strażniki walut i środowiska mówią po polsku, co
 * klient ma zrobić — te pokazujemy. `readCompletePages` i odczyty dopisują po
 * dwukropku tekst PostgREST-a (po angielsku, techniczny), więc z nich zostaje
 * polska część przed dwukropkiem. Wszystko inne (konfiguracja serwera, błąd
 * programu) to ogólny komunikat, a pełny wyjątek idzie do logu.
 */
export function pulpitErrorMessage(error: unknown): string {
  if (error instanceof OutgoingInvoiceCurrencyNotSupportedError || error instanceof KsefExpenseCurrencyNotSupportedError) {
    return error.message;
  }
  const message = error instanceof Error ? error.message : '';
  if (CUSTOMER_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return message.split(': ')[0]!;
  }
  return PULPIT_GENERIC_ERROR;
}

/** Ładowarka karty: dane albo karta błędu z treścią wyjątku. */
async function loadCard(title: string, className: string | undefined, render: () => Promise<ReactNode>) {
  try {
    return await render();
  } catch (error) {
    const message = pulpitErrorMessage(error);
    if (message === PULPIT_GENERIC_ERROR) console.error(`[pulpit] karta „${title}”:`, error);
    return <PulpitCardError title={title} message={message} className={className} />;
  }
}

function changePct(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

// ─── Karty ────────────────────────────────────────────────────────────────

export async function FinanceSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Przychody i koszty', className, async () => {
    const series = await loadSalesSeries(supabase, tenantId, nowIso);
    const keys = series.months.map((m) => m.key);
    const [costEntries, verified] = await Promise.all([
      getCosts(supabase, tenantId, {
        from: `${keys[0]}-01`,
        toExclusive: nextMonthStart(keys[keys.length - 1]!),
      }),
      getDashboardActiveOrgVerified(),
    ]);
    const costs = sumCostsByMonth(costEntries, keys);
    return (
      <FinanceCard
        months={series.months}
        net={series.netSeries}
        costs={costs}
        report={buildMonthReport(series.netSeries, costs)}
        costsHint={!verified && costs.every((c) => c === 0) ? 'connect-ksef' : 'none'}
        className={className}
      />
    );
  });
}

export async function InvoicesTileCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Faktury', className, async () => {
    const figures = await loadMonthlyFigures(supabase, tenantId, nowIso);
    const drafts = figures.draftCount;
    return (
      <StatTile
        icon={RiFileList3Line}
        title="Faktury"
        value={formatPlInt(figures.acceptedCount)}
        change={figures.hasPrevMonth ? { pct: figures.momCountPct } : { note: 'Brak poprzedniego miesiąca' }}
        badge="Ten miesiąc"
        footnote={drafts > 0 ? `+ ${drafts} ${plural(drafts, ['szkic', 'szkice', 'szkiców'])} poza KSeF` : undefined}
        className={className}
      />
    );
  });
}

export async function ReceivablesTileCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Należności', className, async () => {
    const receivables = await loadReceivables(supabase, tenantId, nowIso);
    const skipped = receivables.foreignCurrencyCount;
    return (
      <StatTile
        icon={RiMoneyDollarCircleLine}
        title="Należności"
        value={formatPlCompactMoney(receivables.total)}
        valueTitle={`${formatPlMoney(receivables.total)} zł`}
        badge="Do zapłaty"
        footnote={
          <>
            {receivables.count} {plural(receivables.count, ['faktura nieopłacona', 'faktury nieopłacone', 'faktur nieopłaconych'])}
            {' · '}
            {RECEIVABLES_NOTE}
            {skipped > 0 ? (
              <>
                {' · '}
                Pominięto {skipped} {plural(skipped, ['fakturę', 'faktury', 'faktur'])} w walucie obcej
              </>
            ) : null}
          </>
        }
        className={className}
      />
    );
  });
}

export async function NetRevenueSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Przychód netto', className, async () => {
    const series = await loadSalesSeries(supabase, tenantId, nowIso);
    const net = series.netSeries.slice(-SHORT_MONTHS);
    return (
      <NetRevenueCard
        months={series.months.slice(-SHORT_MONTHS)}
        net={net}
        changePct={changePct(net.at(-1) ?? 0, net.at(-2) ?? 0)}
        className={className}
      />
    );
  });
}

/**
 * „VAT należny” — ta sama liczba co `VatSummaryCard` na `/przeplywy` dla
 * bieżącego miesiąca (seria VAT z tych samych wierszy co `getMonthlyFigures`).
 * Firma zwolniona podmiotowo (art. 113) nie ma VAT należnego ani terminu JPK:
 * widzi tu sprzedaż od 1 stycznia (`SalesYtdCard`).
 */
export async function VatSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  // Najpierw samo zwolnienie: od niego zależy, jaką kartę (i jaki tytuł karty
  // błędu) dostaje klient.
  let exemption: string | null;
  try {
    exemption = await readTenantVatExemption(supabase, tenantId);
  } catch (error) {
    return <PulpitCardError title="VAT należny" message={pulpitErrorMessage(error)} className={className} />;
  }
  const exempt = isSubjectiveVatExemption(exemption);
  return loadCard(exempt ? 'Sprzedaż od 1 stycznia' : 'VAT należny', className, async () => {
    const series = await loadSalesSeries(supabase, tenantId, nowIso);
    if (exempt) {
      const year = todayInWarsaw(new Date(nowIso)).slice(0, 4);
      const ytd = series.months
        .map((m, i) => ({ month: m, net: series.netSeries[i] ?? 0 }))
        .filter(({ month }) => month.key.startsWith(`${year}-`));
      let running = 0;
      const cumulative = ytd.map(({ net }) => (running = roundToCents(running + net)));
      return <SalesYtdCard months={ytd.map(({ month }) => month)} cumulative={cumulative} className={className} />;
    }
    const figures = await loadMonthlyFigures(supabase, tenantId, nowIso);
    return (
      <VatDueCard
        months={series.months.slice(-SHORT_MONTHS)}
        vat={series.vatSeries.slice(-SHORT_MONTHS)}
        net={series.netSeries.slice(-SHORT_MONTHS)}
        vatDueLabel={figures.vatDueLabel}
        daysToVatDue={figures.daysToVatDue}
        className={className}
      />
    );
  });
}

export async function AgingSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Należności według terminu', className, async () => {
    const aging = receivablesAging(await loadReceivables(supabase, tenantId, nowIso));
    return (
      <ReceivablesAgingCard
        total={aging.total}
        count={aging.count}
        buckets={aging.buckets}
        note={RECEIVABLES_NOTE}
        className={className}
      />
    );
  });
}

export async function TopListsSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Najlepiej sprzedające się', className, async () => {
    const now = new Date(nowIso);
    const [products, clients] = await Promise.all([
      getTopProducts(supabase, tenantId, now),
      getTopClients(supabase, tenantId, now),
    ]);
    return <TopListsCard products={products} clients={clients} productsNote={PRODUCTS_NOTE} className={className} />;
  });
}

export async function RecentInvoicesSlotCard({ supabase, tenantId, nowIso, className }: PulpitCardProps & { className?: string }) {
  return loadCard('Ostatnie faktury', className, async () => {
    const now = new Date(nowIso);
    const invoices = await getRecentInvoices(supabase, tenantId, now);
    return <RecentInvoicesCard invoices={invoices} className={className} />;
  });
}

// ─── Siatka ───────────────────────────────────────────────────────────────

function Slot({
  title,
  className,
  variant,
  children,
}: {
  title: string;
  className?: string;
  variant: 'tile' | 'chart' | 'list';
  children: ReactNode;
}) {
  return (
    <SectionErrorBoundary
      fallback={<PulpitCardError title={title} message="Nie udało się wyświetlić karty." className={className} />}
    >
      <Suspense fallback={<PulpitCardSkeleton variant={variant} className={className} />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}

export function PulpitGrid({ className, ...props }: PulpitCardProps & { className?: string }) {
  return (
    <div className={cn('grid grid-cols-6 gap-6', className)}>
      <Slot title="Przychody i koszty" variant="chart" className="col-span-full xl:col-span-4">
        <FinanceSlotCard {...props} className="col-span-full xl:col-span-4" />
      </Slot>

      <div className="col-span-full grid grid-cols-2 gap-6 lg:col-span-3 xl:col-span-2">
        <Slot title="Faktury" variant="tile">
          <InvoicesTileCard {...props} />
        </Slot>
        <Slot title="Należności" variant="tile">
          <ReceivablesTileCard {...props} />
        </Slot>
        <Slot title="Przychód netto" variant="chart">
          <NetRevenueSlotCard {...props} />
        </Slot>
        <Slot title="VAT należny" variant="chart">
          <VatSlotCard {...props} />
        </Slot>
      </div>

      <Slot title="Należności według terminu" variant="chart" className="col-span-full lg:col-span-3 xl:col-span-2">
        <AgingSlotCard {...props} className="col-span-full lg:col-span-3 xl:col-span-2" />
      </Slot>

      <Slot title="Najlepiej sprzedające się" variant="list" className="col-span-full xl:col-span-4">
        <TopListsSlotCard {...props} className="col-span-full xl:col-span-4" />
      </Slot>

      <Slot title="Ostatnie faktury" variant="list" className="col-span-full">
        <RecentInvoicesSlotCard {...props} className="col-span-full py-0 shadow-none" />
      </Slot>
    </div>
  );
}
