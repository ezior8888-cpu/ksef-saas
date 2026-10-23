import { cache, Suspense, type ReactNode } from 'react';
import {
  RiBuilding2Line,
  RiFileList3Line,
  RiGroupLine,
  RiMoneyDollarCircleLine,
  RiShoppingBag3Line,
} from '@remixicon/react';

import { PulpitCardError } from '@/components/dashboard/pulpit/card-states';
import { PULPIT_GENERIC_ERROR, pulpitErrorMessage } from '@/components/dashboard/pulpit/pulpit-grid';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { shiftMonthKey } from '@/lib/analytics-finance/months';
import { getSalesInvoices, salesMonthStats } from '@/lib/analytics-finance/sales';
import { getCosts, sumCostsByMonth } from '@/lib/dashboard/costs';
import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';
import { getTopClients, getTopProducts, warsawMonthWindow } from '@/lib/dashboard/rankings';
import { getReceivables } from '@/lib/dashboard/receivables';
import { receivablesAging } from '@/lib/dashboard/receivables-aging';
import { getVatLimit } from '@/lib/dashboard/vat-limit';
import type { TrybDanych } from '@/lib/demo/tryb-danych';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { isSubjectiveVatExemption, readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import type { PageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

import {
  ODSWIEZ,
  finanseProps,
  kafelFaktur,
  kafelSredniej,
  limitVatProps,
  naleznosciProps,
  przychodProps,
  rankingiProps,
  vatNaleznyProps,
} from './adaptery';
import FinanceCard from './chart-finance';
import TotalVisitorsCard from './chart-total-visitors';
import StatisticsCard from './statistics-card-03';
import StatisticsImpressionCard from './statistics-impression-card';
import StatisticsTotalRevenueCard from './statistics-total-revenue-card';
import TopProductsCard from './widget-top-products';

/**
 * Sloty Pulpitu (PLAN-PRAWDZIWE-DANE §5.6, E5): każda karta Finory to osobny
 * asynchroniczny Server Component w `<Suspense>` i `SectionErrorBoundary`.
 * Strażnik, który rzuci (faktura w EUR, przyjęta faktura bez środowiska),
 * zabiera JEDNĄ kartę z treścią wyjątku (`pulpitErrorMessage`), reszta
 * Pulpitu działa. Wzorzec: `components/analizy/card-slot.tsx`.
 *
 * Oba tryby idą tymi samymi slotami: w trybie `przyklad` `supabase` to
 * atrapa bazy z danymi przykładowymi (`kontekstDanych`), w pozostałych —
 * sesja klienta (RLS). Sloty nie wiedzą, skąd są dane; tryb decyduje tylko
 * o tekście pustego stanu („Pobieramy faktury z KSeF…” w stanie B).
 */

export interface PulpitSlotProps {
  supabase: PageContext['supabase'];
  tenantId: string;
  /** Chwila żądania jako ISO — jeden „teraz” dla wszystkich kart. */
  nowIso: string;
  tryb: TrybDanych;
  /** Data weryfikacji KSeF (Z9: koszty z KSeF „od DD.MM”); `null` przed weryfikacją. */
  verifiedAt: string | null;
}

type SlotProps = PulpitSlotProps & { className?: string };

/** Okno wykresu „Finanse” (Z7). */
const FINANSE_MIESIACE = 7;
/** Okno serii sprzedaży czytanej raz dla Finansów i VAT (12 miesięcy, bez roku wcześniej). */
const SERIA_MIESIACE = 12;
/** Okno karty „Przychód netto” (5 słupków jak w Finorze) z rokiem wcześniej. */
const PRZYCHOD_MIESIACE = 5;

/**
 * Seria sprzedaży raz na żądanie dla kart, które jej potrzebują (Finanse
 * i VAT czytają to samo 12-miesięczne okno). „Przychód netto” czyta osobne
 * okno 5 miesięcy z rokiem wcześniej, żeby stara faktura sprzed roku nie
 * zabierała strażnikiem waluty kart bieżących.
 */
const serieSprzedazy = cache(
  (supabase: PageContext['supabase'], tenantId: string, nowIso: string, months: number, withPrevYear: boolean) =>
    getSalesSeries(supabase, tenantId, new Date(nowIso), { months, withPrevYear }),
);

/** Dane karty albo karta błędu z treścią wyjątku dla klienta. */
async function zaladujKarte(title: string, className: string | undefined, render: () => Promise<ReactNode>) {
  try {
    return await render();
  } catch (error) {
    const message = pulpitErrorMessage(error);
    if (message === PULPIT_GENERIC_ERROR) console.error(`[pulpit] karta „${title}”:`, error);
    return <PulpitCardError title={title} message={message} className={className} />;
  }
}

// ─── Szkielety w kształcie kart Finory (bez skoku układu) ─────────────────

type Wariant = 'finanse' | 'kafel' | 'wykres' | 'naleznosci' | 'listy';

function Szkielet({ wariant, className }: { wariant: Wariant; className?: string }) {
  if (wariant === 'finanse') {
    return (
      <Card className={cn('grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5', className)} aria-busy="true">
        <CardContent className="flex flex-col gap-10 lg:col-span-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="min-h-65 w-full" />
        </CardContent>
        <CardContent className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (wariant === 'listy') {
    return (
      <Card className={cn('gap-x-2 gap-y-6 lg:flex-row', className)} aria-busy="true">
        {[0, 1].map((side) => (
          <CardContent key={side} className="flex flex-1 flex-col gap-4">
            <Skeleton className="h-5 w-40" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </CardContent>
        ))}
      </Card>
    );
  }
  return (
    <Card className={className} aria-busy="true">
      <CardContent className="flex flex-col gap-4">
        {wariant === 'kafel' ? <Skeleton className="size-9.5 rounded-full" /> : <Skeleton className="h-5 w-28" />}
        {wariant === 'kafel' ? <Skeleton className="h-6 w-24" /> : null}
        {wariant === 'wykres' ? <Skeleton className="h-31 w-full" /> : null}
        {wariant === 'naleznosci' ? <Skeleton className="min-h-35 w-full" /> : null}
        <Skeleton className="h-5 w-20" />
      </CardContent>
    </Card>
  );
}

function Slot({ title, wariant, className, children }: { title: string; wariant: Wariant; className?: string; children: ReactNode }) {
  return (
    <SectionErrorBoundary
      fallback={<PulpitCardError title={title} message="Nie udało się wyświetlić karty." className={className} />}
    >
      <Suspense fallback={<Szkielet wariant={wariant} className={className} />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}

// ─── Karty ────────────────────────────────────────────────────────────────

async function FinanseKarta({ supabase, tenantId, nowIso, tryb, verifiedAt, className }: SlotProps) {
  return zaladujKarte('Finanse', className, async () => {
    const series = await serieSprzedazy(supabase, tenantId, nowIso, SERIA_MIESIACE, false);
    const months = series.months.slice(-FINANSE_MIESIACE);
    const costs = sumCostsByMonth(
      await getCosts(supabase, tenantId, warsawMonthWindow(new Date(nowIso), FINANSE_MIESIACE)),
      months.map((m) => m.key),
    );
    const dane = finanseProps({
      months,
      net: series.netSeries.slice(-FINANSE_MIESIACE),
      vat: series.vatSeries.slice(-FINANSE_MIESIACE),
      costs,
      tryb,
      verifiedAt,
    });
    return (
      <FinanceCard
        {...dane}
        financeMenu={[ODSWIEZ, { label: 'Analiza sprzedaży', href: '/analizy/sprzedaz' }]}
        reportMenu={[ODSWIEZ, { label: 'Księga KPiR', href: '/reports/kpir' }]}
        className={className}
      />
    );
  });
}

async function KafelFakturKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  return zaladujKarte('Faktury w KSeF', className, async () => {
    const dane = kafelFaktur(await getMonthlyFigures(supabase, tenantId, new Date(nowIso)), tryb);
    return (
      <StatisticsCard
        icon={<RiFileList3Line />}
        title="Faktury w KSeF"
        value={dane.value}
        changePct={dane.changePct}
        badgeContent={dane.badge}
        iconClassName="bg-chart-3/20 text-chart-3"
        className={className}
      />
    );
  });
}

async function KafelSredniejKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  return zaladujKarte('Średnia faktura', className, async () => {
    const now = new Date(nowIso);
    const month = todayInWarsaw(now).slice(0, 7);
    const prev = shiftMonthKey(month, -1);
    const invoices = await getSalesInvoices(supabase, tenantId, warsawMonthWindow(now, 2));
    const dane = kafelSredniej(
      salesMonthStats(invoices, month, prev).avgPerInvoice,
      salesMonthStats(invoices, prev, shiftMonthKey(prev, -1)).avgPerInvoice,
      tryb,
    );
    return (
      <StatisticsCard
        icon={<RiMoneyDollarCircleLine />}
        title="Średnia faktura"
        value={dane.value}
        valueTitle={dane.valueTitle}
        changePct={dane.changePct}
        badgeContent={dane.badge}
        iconClassName="bg-chart-3/20 text-chart-3"
        className={className}
      />
    );
  });
}

async function PrzychodKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  return zaladujKarte('Przychód netto', className, async () => {
    const series = await serieSprzedazy(supabase, tenantId, nowIso, PRZYCHOD_MIESIACE, true);
    return <StatisticsTotalRevenueCard {...przychodProps(series, tryb)} className={className} />;
  });
}

/**
 * Płatnik VAT: „VAT należny” z 12 miesięcy. Firma zwolniona podmiotowo
 * (art. 113) nie ma VAT należnego — widzi limit zwolnienia (rozgałęzienie
 * jak `VatSlotCard` w `components/dashboard/pulpit/pulpit-grid.tsx`).
 */
async function VatKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  let exemption: string | null;
  try {
    exemption = await readTenantVatExemption(supabase, tenantId);
  } catch (error) {
    return <PulpitCardError title="VAT należny" message={pulpitErrorMessage(error)} className={className} />;
  }
  const exempt = isSubjectiveVatExemption(exemption);
  return zaladujKarte(exempt ? 'Limit VAT' : 'VAT należny', className, async () => {
    const dane = exempt
      ? limitVatProps(await getVatLimit(supabase, tenantId, new Date(nowIso)), tryb)
      : vatNaleznyProps(await serieSprzedazy(supabase, tenantId, nowIso, SERIA_MIESIACE, false), tryb);
    return <StatisticsImpressionCard {...dane} className={className} />;
  });
}

async function NaleznosciKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  return zaladujKarte('Należności', className, async () => {
    const aging = receivablesAging(await getReceivables(supabase, tenantId, new Date(nowIso)));
    return <TotalVisitorsCard {...naleznosciProps(aging, tryb)} className={className} />;
  });
}

/** Kolory kółek ikon Finory, po kolei (5 pozycji). */
const KOLORY_IKON: (string | undefined)[] = [
  'bg-primary/10 text-primary dark:bg-primary/25',
  'bg-chart-2/10 text-chart-2',
  'bg-chart-5/10 text-chart-5',
  undefined,
  'bg-chart-3/10 text-chart-3',
];

async function RankingiKarta({ supabase, tenantId, nowIso, tryb, className }: SlotProps) {
  return zaladujKarte('Najlepiej sprzedające się', className, async () => {
    const now = new Date(nowIso);
    const [products, clients] = await Promise.all([
      getTopProducts(supabase, tenantId, now),
      getTopClients(supabase, tenantId, now),
    ]);
    const dane = rankingiProps(products, clients, tryb);
    return (
      <TopProductsCard
        salesTitle="Najlepiej sprzedające się"
        salesMenu={[ODSWIEZ, { label: 'Faktury', href: '/invoices' }]}
        productsBySalesData={dane.products.map((p, i) => ({
          icon: <RiShoppingBag3Line />,
          productName: p.name,
          productBrand: p.sub,
          sales: p.amount,
          salesTitle: p.amountTitle,
          iconClassName: KOLORY_IKON[i],
        }))}
        salesEmpty={dane.productsEmpty}
        volumeTitle="Najwięksi klienci"
        volumeMenu={[ODSWIEZ, { label: 'Kontrahenci', href: '/contractors' }]}
        productsByVolumeData={dane.clients.map((c, i) => ({
          icon: clients[i]?.consumers ? <RiGroupLine /> : <RiBuilding2Line />,
          productName: c.name,
          productBrand: c.sub,
          volume: c.amount,
          volumeTitle: c.amountTitle,
          changePercentage: c.changePct,
          iconClassName: KOLORY_IKON[i],
        }))}
        volumeEmpty={dane.clientsEmpty}
        className={className}
      />
    );
  });
}

// ─── Sloty (karta + Suspense + granica błędu) ─────────────────────────────

export function FinanseSlot(props: SlotProps) {
  return (
    <Slot title="Finanse" wariant="finanse" className={props.className}>
      <FinanseKarta {...props} />
    </Slot>
  );
}

export function KafelFakturSlot(props: SlotProps) {
  return (
    <Slot title="Faktury w KSeF" wariant="kafel" className={props.className}>
      <KafelFakturKarta {...props} />
    </Slot>
  );
}

export function KafelSredniejSlot(props: SlotProps) {
  return (
    <Slot title="Średnia faktura" wariant="kafel" className={props.className}>
      <KafelSredniejKarta {...props} />
    </Slot>
  );
}

export function PrzychodSlot(props: SlotProps) {
  return (
    <Slot title="Przychód netto" wariant="wykres" className={props.className}>
      <PrzychodKarta {...props} />
    </Slot>
  );
}

export function VatSlot(props: SlotProps) {
  return (
    <Slot title="VAT należny" wariant="wykres" className={props.className}>
      <VatKarta {...props} />
    </Slot>
  );
}

export function NaleznosciSlot(props: SlotProps) {
  return (
    <Slot title="Należności" wariant="naleznosci" className={props.className}>
      <NaleznosciKarta {...props} />
    </Slot>
  );
}

export function RankingiSlot(props: SlotProps) {
  return (
    <Slot title="Najlepiej sprzedające się" wariant="listy" className={props.className}>
      <RankingiKarta {...props} />
    </Slot>
  );
}
