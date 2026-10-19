import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plan Finora E4, kryteria „Gotowe, gdy” i §2.4 pkt 15:
 * - strona `/dashboard` nie woła na swoim poziomie żadnej funkcji z liczbami,
 *   więc slot FLO renderuje się także wtedy, gdy padną wszystkie karty;
 * - faktura w EUR wyłącza karty sprzedaży (każda pokazuje treść wyjątku
 *   i wyjście do `/przeplywy`), a karta bez sprzedaży działa dalej.
 */

const data = vi.hoisted(() => ({
  getSalesSeries: vi.fn(),
  getMonthlyFigures: vi.fn(),
  getCosts: vi.fn(),
  getReceivables: vi.fn(),
  getTopProducts: vi.fn(),
  getTopClients: vi.fn(),
  getRecentInvoices: vi.fn(),
  readTenantVatExemption: vi.fn(),
  getVatLimit: vi.fn(),
  listProposals: vi.fn(),
  listScheduled: vi.fn(),
}));

vi.mock('@/lib/supabase/page-context', () => ({
  getPageContext: async () => ({ supabase: {}, tenantId: 'firma-a' }),
}));
vi.mock('@/app/actions/flo', () => ({
  listProposals: data.listProposals,
  listScheduled: data.listScheduled,
}));
vi.mock('@/components/flo/flo-screen', () => ({ FloScreen: () => <div data-testid="flo-screen" /> }));
vi.mock('@/components/flo/flo-composer', () => ({ FloComposer: () => <div data-testid="flo-composer" /> }));
vi.mock('@/components/flo/scheduled-panel', () => ({ FloScheduledPanel: () => null }));
vi.mock('@/components/dashboard/flo-welcome', () => ({ FloWelcome: () => <div data-testid="flo-welcome" /> }));
vi.mock('@/app/(dashboard)/_components/dashboard-verification-banner', () => ({ default: () => null }));
vi.mock('@/lib/dashboard-shell-data', () => ({ getDashboardActiveOrgVerified: async () => true }));
vi.mock('@/lib/dashboard/monthly-figures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/monthly-figures')>()),
  getSalesSeries: data.getSalesSeries,
  getMonthlyFigures: data.getMonthlyFigures,
}));
vi.mock('@/lib/dashboard/costs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/costs')>()),
  getCosts: data.getCosts,
}));
vi.mock('@/lib/dashboard/receivables', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/receivables')>()),
  getReceivables: data.getReceivables,
}));
vi.mock('@/lib/dashboard/rankings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/rankings')>()),
  getTopProducts: data.getTopProducts,
  getTopClients: data.getTopClients,
}));
vi.mock('@/lib/dashboard/recent-invoices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/recent-invoices')>()),
  getRecentInvoices: data.getRecentInvoices,
}));
vi.mock('@/lib/dashboard/vat-limit', () => ({ getVatLimit: data.getVatLimit }));
vi.mock('@/lib/invoices/vat-exemption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invoices/vat-exemption')>()),
  readTenantVatExemption: data.readTenantVatExemption,
}));

import DashboardHomePage from '@/app/(dashboard)/dashboard/page';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import {
  FinanceSlotCard,
  NetRevenueSlotCard,
  PULPIT_GENERIC_ERROR,
  PulpitGrid,
  pulpitErrorMessage,
  RecentInvoicesSlotCard,
  VatSlotCard,
} from '@/components/dashboard/pulpit/pulpit-grid';
import { OutgoingInvoiceCurrencyNotSupportedError } from '@/lib/exports/currency-guard';
import { KsefExpenseCurrencyNotSupportedError } from '@/lib/expenses/ksef-currency-review';

const CARD = { supabase: {} as never, tenantId: 'firma-a', nowIso: '2026-10-19T10:00:00.000Z' };
const SALES_FUNCTIONS = ['getSalesSeries', 'getMonthlyFigures', 'getCosts', 'getReceivables', 'getTopProducts', 'getTopClients', 'getRecentInvoices'] as const;

/**
 * Przejście po drzewie z rozwinięciem SYNCHRONICZNYCH komponentów funkcyjnych
 * strony (slot FLO). Siatki nie rozwijamy — jej karty to asynchroniczne
 * Server Components, testowane niżej osobno.
 */
function walk(node: ReactNode, visit: (el: ReactElement<Record<string, unknown>>) => void) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<Record<string, unknown>>;
    visit(el);
    const type = el.type as unknown;
    if (typeof type === 'function' && type !== PulpitGrid && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
      const rendered = (type as (props: unknown) => unknown)(el.props);
      if (!(rendered instanceof Promise)) walk(rendered as ReactNode, visit);
      return;
    }
    walk(el.props.children as ReactNode, visit);
  });
}

function floSlotOf(page: ReactNode): ReactElement {
  let slot: ReactElement | null = null;
  walk(page, (el) => {
    if ((el.type as { name?: string }).name === 'FloSlot') slot = el;
  });
  if (!slot) throw new Error('Brak slotu FLO w drzewie strony');
  return slot;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of SALES_FUNCTIONS) {
    data[name].mockRejectedValue(new Error(`${name} nie powinno być wołane przez stronę`));
  }
  data.readTenantVatExemption.mockResolvedValue(null);
  data.listProposals.mockResolvedValue([]);
  data.listScheduled.mockResolvedValue([]);
});

describe('/dashboard — slot FLO niezależny od kart (§2.4 pkt 15)', () => {
  it('strona nie woła żadnej funkcji z liczbami, a slot FLO i siatka są w drzewie', async () => {
    const page = await DashboardHomePage();

    for (const name of SALES_FUNCTIONS) expect(data[name]).not.toHaveBeenCalled();

    const classes: string[] = [];
    let grid: ReactElement<Record<string, unknown>> | null = null;
    walk(page, (el) => {
      if (typeof el.props.className === 'string') classes.push(el.props.className);
      if (el.type === PulpitGrid) grid = el;
    });
    expect(classes.some((c) => c.startsWith('ff-flo-legacy '))).toBe(true);
    expect(grid).not.toBeNull();
    // Siatka tylko od `lg`; na telefonie Pulpit to sam FLO.
    expect((grid as unknown as ReactElement<{ className: string }>).props.className).toBe('hidden lg:grid');
  });

  it('awaria agenta: komunikat odsyła do kart, a na telefonie do zakładki „Miesiąc”', async () => {
    data.listProposals.mockRejectedValue(new Error('brak tabel FLO'));
    const html = renderToStaticMarkup(floSlotOf(await DashboardHomePage()));
    expect(html).toContain('ff-flo-legacy');
    expect(html).toContain('Liczby miesiąca są w kartach poniżej');
    expect(html).toContain('Liczby miesiąca są w zakładce „Miesiąc”');
    expect(html).not.toContain('obok są aktualne');
  });
});

describe('faktura w EUR wyłącza karty sprzedaży (kryterium E4)', () => {
  beforeEach(() => {
    data.getSalesSeries.mockRejectedValue(new OutgoingInvoiceCurrencyNotSupportedError());
    data.getMonthlyFigures.mockRejectedValue(new OutgoingInvoiceCurrencyNotSupportedError());
    data.getCosts.mockResolvedValue([]);
    data.getRecentInvoices.mockResolvedValue([]);
  });

  it.each([
    ['Przychody i koszty', FinanceSlotCard],
    ['Przychód netto', NetRevenueSlotCard],
    ['VAT należny', VatSlotCard],
  ])('%s: karta błędu z treścią wyjątku i linkiem do przepływów', async (title, Card) => {
    const html = renderToStaticMarkup(await Card(CARD));
    expect(html).toContain(title);
    expect(html).toContain('faktura sprzedaży nie ma potwierdzonej waluty PLN');
    expect(html).toContain('href="/przeplywy"');
  });

  it('karta bez danych sprzedaży (ostatnie faktury) renderuje się normalnie', async () => {
    const html = renderToStaticMarkup(await RecentInvoicesSlotCard(CARD));
    expect(html).toContain('Ostatnie faktury');
    expect(html).not.toContain('potwierdzonej waluty PLN');
  });
});

describe('slot FLO — wywrotka wątku przy renderze (przegląd E4)', () => {
  it('granica błędu pokazuje komunikat i szynę, nie pusty slot', async () => {
    data.listProposals.mockResolvedValue([{ id: 'p-1' }]);
    let fallback: ReactNode = null;
    walk(await DashboardHomePage(), (el) => {
      if (el.type === SectionErrorBoundary) fallback = el.props.fallback as ReactNode;
    });
    const html = renderToStaticMarkup(<>{fallback}</>);
    expect(html).toContain('Flo chwilowo się nie wyświetla.');
    expect(html).toContain('Liczby miesiąca są w kartach poniżej');
  });
});

describe('treść wyjątku na karcie (przegląd E4)', () => {
  it('strażniki walut: pełny polski komunikat', () => {
    expect(pulpitErrorMessage(new OutgoingInvoiceCurrencyNotSupportedError())).toContain('potwierdzonej waluty PLN');
    expect(pulpitErrorMessage(new KsefExpenseCurrencyNotSupportedError())).toContain('koszt ze skrzynki KSeF');
  });

  it('odczyt: polska część bez technicznego ogona PostgREST-a', () => {
    expect(pulpitErrorMessage(new Error('Nie można odczytać należności: permission denied for table invoices')))
      .toBe('Nie można odczytać należności');
    expect(pulpitErrorMessage(new Error('Przyjęte faktury wymagają uzgodnienia środowiska KSeF')))
      .toBe('Przyjęte faktury wymagają uzgodnienia środowiska KSeF');
  });

  it('wszystko inne: ogólny komunikat, nie angielski tekst', () => {
    expect(pulpitErrorMessage(new Error('KSEF_ENV is not configured'))).toBe(PULPIT_GENERIC_ERROR);
    expect(pulpitErrorMessage('x')).toBe(PULPIT_GENERIC_ERROR);
  });

  it('karta pokazuje polską część, a nie ogon PostgREST-a', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    data.getSalesSeries.mockRejectedValue(new Error('Nie można odczytać wykresu sprzedaży: canceling statement due to statement timeout'));
    const html = renderToStaticMarkup(await NetRevenueSlotCard(CARD));
    expect(html).toContain('Nie można odczytać wykresu sprzedaży');
    expect(html).not.toContain('statement timeout');
  });
});

describe('firma zwolniona podmiotowo z VAT — karta „Limit zwolnienia z VAT”', () => {
  const overview = {
    year: 2026,
    today: '2026-10-19',
    months: [{ key: '2026-01', label: 'Sty' }, { key: '2026-02', label: 'Lut' }],
    cumulative: [10_000, 150_000],
    used: 150_000,
    annualLimit: 240_000,
    startedOn: '2020-01-01',
    limit: {
      effectiveLimit: 240_000, prorated: false, activeDays: 365, daysInYear: 365, pct: 62.5,
      remaining: 90_000, level: 60 as const, formula: '240 000,00 zł (pełny rok)', crossesOn: '2026-12-01',
    },
    lowerBound: null,
  };

  beforeEach(() => {
    data.readTenantVatExemption.mockResolvedValue('art. 113 ust. 1 ustawy o VAT');
    data.getVatLimit.mockResolvedValue(overview);
  });

  it('limit z funkcji vat-limit, bez VAT należnego, terminu JPK i serii sprzedaży', async () => {
    const html = renderToStaticMarkup(await VatSlotCard(CARD));
    expect(html).toContain('Limit zwolnienia z VAT');
    // 62,5% w dół — wyświetlany procent nie wyprzedza progu (jak propozycja FLO).
    expect(html).toContain('62%');
    expect(html).toContain('01.12.2026');
    expect(html).not.toContain('VAT należny');
    expect(data.getVatLimit).toHaveBeenCalledWith(CARD.supabase, CARD.tenantId, new Date(CARD.nowIso));
    expect(data.getSalesSeries).not.toHaveBeenCalled();
    expect(data.getMonthlyFigures).not.toHaveBeenCalled();
  });

  it('błąd odczytu sprzedaży: karta błędu pod tytułem „Limit zwolnienia z VAT”', async () => {
    data.getVatLimit.mockRejectedValue(new OutgoingInvoiceCurrencyNotSupportedError());
    const html = renderToStaticMarkup(await VatSlotCard(CARD));
    expect(html).toContain('Limit zwolnienia z VAT');
    expect(html).toContain('potwierdzonej waluty PLN');
    expect(html).not.toContain('VAT należny');
  });

  it('czynny podatnik dalej dostaje „VAT należny”', async () => {
    data.readTenantVatExemption.mockResolvedValue(null);
    data.getSalesSeries.mockResolvedValue({
      months: [{ key: '2026-10', label: 'Paź' }], netSeries: [1000], vatSeries: [230], currentSeries: [1230], prevSeries: [], currentMonthKey: '2026-10',
    });
    data.getMonthlyFigures.mockResolvedValue({ vatDueLabel: '25.11.2026', daysToVatDue: 37 });
    const html = renderToStaticMarkup(await VatSlotCard(CARD));
    expect(html).toContain('VAT należny');
    expect(data.getVatLimit).not.toHaveBeenCalled();
  });
});
