import { renderToStaticMarkup } from 'react-dom/server';
import { RiArrowDownLine, RiArrowUpLine, RiReceiptLine } from '@remixicon/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/analizy/koszty',
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
}));

const { AnalizyHeader } = await import('@/components/analizy/analizy-header');
const { default: CategoryBreakdownChart } = await import('@/components/analizy/finora/category-breakdown-chart');
const { default: CategoryRankedList } = await import('@/components/analizy/finora/category-ranked-list');
const { default: AssetAllocationCard } = await import('@/components/analizy/finora/chart-asset-allocation');
const { ANALIZY_EMPTY, CONCENTRATION_WARNING } = await import('@/components/analizy/finora/empty');
const { default: IncomeExpenseSummary } = await import('@/components/analizy/finora/income-expense-summary');
const { CostStatsCards, SalesStatsCards } = await import('@/components/analizy/finora/monthly-stats-cards');
const { default: MoverListCard, formatMoverPercent } = await import('@/components/analizy/finora/mover-list-card');
const { default: RecentExpensesFeed } = await import('@/components/analizy/finora/recent-expenses-feed');
const { default: SpendHeatmap } = await import('@/components/analizy/finora/spend-heatmap');
const { default: SpendTrendChart } = await import('@/components/analizy/finora/spend-trend-chart');
const { default: SpendingStreaksCard } = await import('@/components/analizy/finora/spending-streaks-card');
const { default: SubscriptionsCard } = await import('@/components/analizy/finora/subscriptions-card');
const { analyticsMonthOptions } = await import('@/lib/analytics-finance/months');
const { formatPlCompactMoney, formatPlMoney } = await import('@/lib/format/pl');

/**
 * Karty `/analizy/*` (plan Finora P10/P11, §9 „Każdy PR etapu” pkt 1):
 * każda karta jako komponent prezentacyjny — stan z danymi i pusty (§7.3).
 * Bez danych przykładowych Finory (`$`, awatary), bez szkła (pkt 5).
 */

/** SSR wstawia <!-- --> między sąsiednie węzły tekstowe — usuwamy je. */
function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!-- -->/g, '');
}

function noFinoraLeftovers(out: string) {
  expect(out).not.toMatch(/\$\s?\d/);
  expect(out).not.toContain('images/avatars');
  expect(out).not.toContain('backdrop-blur');
  expect(out).not.toContain('ff-glass-pane');
}

const slices = [
  { key: 'a', label: 'Paliwo', amount: 600, percentage: 60, other: false },
  { key: 'pozostale', label: 'Pozostałe', amount: 400, percentage: 40, other: true },
];

describe('AnalizyHeader + wybór miesiąca', () => {
  it('tytuł, podpis i wybrany miesiąc po polsku', () => {
    const out = html(
      <AnalizyHeader
        title="Analiza kosztów"
        description="Śledź wydatki."
        options={analyticsMonthOptions(new Date('2026-10-17T10:00:00Z'))}
        month="2026-09"
      />,
    );
    expect(out).toContain('<h1');
    expect(out).toContain('Analiza kosztów');
    expect(out).toContain('aria-label="Wybierz miesiąc"');
    expect(out).toContain('Wrzesień 2026');
    noFinoraLeftovers(out);
  });
});

describe('kafle miesiąca', () => {
  it('koszty: Wydano w skrócie z pełną kwotą w title, zmiana z minusem typograficznym', () => {
    const out = html(<CostStatsCards stats={{ total: 45600, avgDaily: 1520, changePct: -8.4, topCategory: 'Paliwo' }} />);
    expect(out).toContain('Wydano (brutto)');
    expect(out).toContain(`title="${formatPlMoney(45600)} zł"`);
    expect(out).toContain(formatPlCompactMoney(45600));
    expect(out).toContain('−8%');
    expect(out).toContain('Największa kategoria');
    expect(out).toContain('Paliwo');
    noFinoraLeftovers(out);
  });

  it('koszty pusto: „—” i podpis o braku poprzedniego miesiąca', () => {
    const out = html(<CostStatsCards stats={{ total: 0, avgDaily: 0, changePct: null, topCategory: null }} />);
    expect(out).toContain('Brak wydatków w poprzednim miesiącu');
    expect(out).toContain('—');
  });

  it('sprzedaż: Sprzedano, Średnio na fakturę, Najlepszy klient; pusto bez średniej', () => {
    const out = html(<SalesStatsCards stats={{ total: 1200, invoiceCount: 3, avgPerInvoice: 400, changePct: 12, bestClient: 'Klient A' }} />);
    expect(out).toContain('Sprzedano (netto)');
    expect(out).toContain('Średnio na fakturę');
    expect(out).toContain('+12%');
    expect(out).toContain('Klient A');
    const empty = html(<SalesStatsCards stats={{ total: 0, invoiceCount: 0, avgPerInvoice: null, changePct: null, bestClient: null }} />);
    expect(empty).toContain('Brak sprzedaży w poprzednim miesiącu');
  });
});

describe('Trend', () => {
  const months = ['Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź'].map((label, i) => ({ key: `k${i}`, label, amount: 0 }));

  it('pusto: komunikat i akcja z §7.3', () => {
    const out = html(<SpendTrendChart title="Trend sprzedaży" description="6 mies." seriesLabel="Sprzedaż" data={months} empty={ANALIZY_EMPTY.noInvoices} />);
    expect(out).toContain(ANALIZY_EMPTY.noInvoices.message);
    expect(out).toContain('href="/invoices/new"');
  });

  it('jeden miesiąc: kwota bez wykresu i „Wykres pojawi się po drugim miesiącu”', () => {
    const data = months.map((m, i) => (i === 5 ? { ...m, amount: 1234.5 } : m));
    const out = html(<SpendTrendChart title="Trend wydatków" description="6 mies." seriesLabel="Wydatki" data={data} empty={ANALIZY_EMPTY.noCostsInTrend} />);
    expect(out).toContain('1234,50 zł');
    expect(out).toContain(ANALIZY_EMPTY.trendAfterSecondMonth);
  });

  it('dwa miesiące: wykres (kontener recharts), bez pustego stanu', () => {
    const data = months.map((m, i) => (i >= 4 ? { ...m, amount: 100 * i } : m));
    const out = html(<SpendTrendChart title="Trend wydatków" description="6 mies." seriesLabel="Wydatki" data={data} empty={ANALIZY_EMPTY.noCostsInTrend} />);
    expect(out).toContain('data-slot="chart"');
    expect(out).not.toContain(ANALIZY_EMPTY.trendAfterSecondMonth);
    expect(out).not.toContain(ANALIZY_EMPTY.noCostsInTrend.message);
  });
});

describe('Podział i ranking', () => {
  it('wykres kołowy: dane → kontener, pusto → komunikat (Podłącz KSeF)', () => {
    const out = html(<CategoryBreakdownChart title="Wydatki według kategorii" description="d" data={slices} empty={ANALIZY_EMPTY.connectKsef} />);
    expect(out).toContain('data-slot="chart"');
    const empty = html(<CategoryBreakdownChart title="Wydatki według kategorii" description="d" data={[]} empty={ANALIZY_EMPTY.connectKsef} />);
    expect(empty).toContain(ANALIZY_EMPTY.connectKsef.message);
    expect(empty).toContain('href="/settings/ksef"');
  });

  it('ranking: nazwa, kwota po polsku, pasek; pusto → komunikat', () => {
    const out = html(<CategoryRankedList title="Największe kategorie" description="d" data={slices} kind="category" empty={ANALIZY_EMPTY.noCostsThisMonth} />);
    expect(out).toContain('Paliwo');
    expect(out).toContain('600,00 zł');
    expect(out).toContain('Pozostałe');
    expect(out).toContain('role="progressbar"');
    noFinoraLeftovers(out);
    const empty = html(<CategoryRankedList title="Najlepsze produkty i usługi" description="d" data={[]} kind="product" empty={ANALIZY_EMPTY.noProducts} />);
    expect(empty).toContain(ANALIZY_EMPTY.noProducts.message);
  });
});

describe('Listy', () => {
  it('ostatnie wydatki: nazwa, data, kwota; pusto → komunikat', () => {
    const out = html(
      <RecentExpensesFeed title="Ostatnie wydatki" description="d" direction="out"
        items={[{ id: '1', name: 'Stacja Paliw', subtitle: '05.10.2026', amount: 200 }]} empty={ANALIZY_EMPTY.noCostsThisMonth} />,
    );
    expect(out).toContain('Stacja Paliw');
    expect(out).toContain('05.10.2026');
    expect(out).toContain('200,00 zł');
    expect(out).toContain('text-destructive');
    const empty = html(<RecentExpensesFeed title="Ostatnie faktury" description="d" direction="in" items={[]} empty={ANALIZY_EMPTY.noSalesThisMonth} />);
    expect(empty).toContain(ANALIZY_EMPTY.noSalesThisMonth.message);
  });

  it('korekta in minus w „Ostatnich fakturach”: strzałka w dół, destructive, minus typograficzny', () => {
    const down = renderToStaticMarkup(<RiArrowDownLine />).match(/ d="([^"]+)"/)?.[1];
    const up = renderToStaticMarkup(<RiArrowUpLine />).match(/ d="([^"]+)"/)?.[1];
    const out = html(
      <RecentExpensesFeed title="Ostatnie faktury" description="d" direction="in"
        items={[{ id: 'k', name: 'Klient', subtitle: 'Korekta · KOR/1 · 05.10.2026', amount: -1230 }]} empty={ANALIZY_EMPTY.noSalesThisMonth} />,
    );
    expect(out).toContain('\u22121230,00 zł');
    expect(out).not.toContain('-1230,00 zł');
    expect(out).toContain('text-destructive');
    expect(out).not.toContain('text-green-700');
    expect(out).toContain(down!);
    expect(out).not.toContain(up!);
  });

  it('korekta zakupu in minus w „Ostatnich wydatkach”: strzałka w górę, zielony, minus typograficzny', () => {
    const up = renderToStaticMarkup(<RiArrowUpLine />).match(/ d="([^"]+)"/)?.[1];
    const out = html(
      <RecentExpensesFeed title="Ostatnie wydatki" description="d" direction="out"
        items={[{ id: 'k', name: 'Dostawca', subtitle: '05.10.2026', amount: -50 }]} empty={ANALIZY_EMPTY.noCostsThisMonth} />,
    );
    expect(out).toContain('\u221250,00 zł');
    expect(out).toContain('text-green-700');
    expect(out).not.toContain('text-destructive');
    expect(out).toContain(up!);
  });

  it('wiersze: tytuły i wartości', () => {
    const out = html(<SpendingStreaksCard title="VAT z wydatków" description="d"
      rows={[{ icon: RiReceiptLine, iconClassName: 'text-foreground', title: 'VAT naliczony', value: '23,00 zł' }]} />);
    expect(out).toContain('VAT naliczony');
    expect(out).toContain('23,00 zł');
  });

  it('przychody a koszty: przychody, koszty i wynik (także ujemny)', () => {
    const out = html(<IncomeExpenseSummary income={1000} expense={1500.5} />);
    expect(out).toContain('Przychody a koszty');
    expect(out).toContain('1000,00 zł');
    expect(out).toContain('1500,50 zł');
    expect(out).toMatch(/-500,50 zł|−500,50 zł/);
  });

  it('stałe koszty: nazwa, typowy dzień, średnia; pusto → komunikat N3', () => {
    const out = html(<SubscriptionsCard title="Stałe koszty" description="d"
      items={[{ key: 'k', name: 'Hosting sp. z o.o.', averageAmount: 123, typicalDay: 11, months: 3 }]} empty={ANALIZY_EMPTY.noRecurringSuppliers} />);
    expect(out).toContain('Hosting sp. z o.o.');
    expect(out).toContain('zwykle około 11. dnia miesiąca');
    expect(out).toContain('123,00 zł');
    const empty = html(<SubscriptionsCard title="Stali klienci" description="d" items={[]} empty={ANALIZY_EMPTY.noRecurringClients} />);
    expect(empty).toContain(ANALIZY_EMPTY.noRecurringClients.message);
  });
});

describe('Kalendarz', () => {
  it('dane: komórki z datą i kwotą po polsku, podpisy dni od poniedziałku', () => {
    const out = html(<SpendHeatmap title="Kalendarz wydatków" description="d"
      days={[{ date: '2026-10-19', amount: 0 }, { date: '2026-10-20', amount: 50 }]} empty={ANALIZY_EMPTY.noCostsInWindow} />);
    expect(out).toContain('aria-label="20.10.2026 — 50,00 zł"');
    expect(out).toContain('title="poniedziałek"');
    // Przewijany w bok kontener osiągalny klawiaturą (WCAG 2.1.1, axe `scrollable-region-focusable`).
    expect(out).toMatch(/<div(?=[^>]*role="region")(?=[^>]*aria-label="Kalendarz wydatków")(?=[^>]*tabindex="0")[^>]*overflow-x-auto/);
    expect(out).toContain('bg-chart-1');
  });

  it('pusto: komunikat zamiast pustej siatki', () => {
    const out = html(<SpendHeatmap title="Kalendarz sprzedaży" description="d"
      days={[{ date: '2026-10-19', amount: 0 }]} empty={ANALIZY_EMPTY.noSalesInWindow} />);
    expect(out).toContain(ANALIZY_EMPTY.noSalesInWindow.message);
    expect(out).not.toContain('aria-label="19.10.2026');
  });
});

describe('Klienci', () => {
  it('udział: wykres i ostrzeżenie przy > 50%; pusto → komunikat', () => {
    const out = html(<AssetAllocationCard data={slices} concentrated empty={ANALIZY_EMPTY.noSalesThisMonth} />);
    expect(out).toContain('Udział klientów w przychodach');
    expect(out).toContain(CONCENTRATION_WARNING);
    // Odpowiednik tekstowy wykresu (WCAG 1.1.1): kwota i udział każdego wycinka.
    expect(out).toMatch(/<ul[^>]*class="sr-only"[^>]*>.*Paliwo: 600,00 zł \(60%\).*Pozostałe: 400,00 zł \(40%\)/);
    expect(html(<AssetAllocationCard data={slices} concentrated={false} empty={ANALIZY_EMPTY.noSalesThisMonth} />))
      .not.toContain(CONCENTRATION_WARNING);
    expect(html(<AssetAllocationCard data={[]} concentrated={false} empty={ANALIZY_EMPTY.noInvoices} />))
      .toContain(ANALIZY_EMPTY.noInvoices.message);
  });

  it('rośnie / spada: nazwa, NIP, procent po polsku; pusto → komunikat', () => {
    const out = html(<MoverListCard mode="losers" empty={ANALIZY_EMPTY.noLosers}
      items={[{ key: 'k', name: 'Klient Spada', subtitle: 'NIP 1234567890', percent: -25.5, net: 1, prevNet: 2 }]} />);
    expect(out).toContain('Klienci: spada');
    expect(out).toContain('Klient Spada');
    expect(out).toContain('NIP 1234567890');
    expect(out).toContain('−25,5%');
    expect(out).toContain('KS');
    noFinoraLeftovers(out);
    expect(html(<MoverListCard mode="gainers" items={[]} empty={ANALIZY_EMPTY.noGainers} />)).toContain(ANALIZY_EMPTY.noGainers.message);
    expect(formatMoverPercent(12)).toBe('+12,0%');
  });
});
