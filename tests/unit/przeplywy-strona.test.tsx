import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn(), verified: vi.fn(async () => true) }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.context }));
vi.mock('@/lib/dashboard-shell-data', () => ({ getDashboardActiveOrgVerified: mocks.verified }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

import PrzeplywyPage from '@/app/(dashboard)/przeplywy/page';
import CashFlowCard from '@/components/przeplywy/finora/chart-cash-flow';
import VatSummaryCard from '@/components/przeplywy/finora/chart-net-worth';
import { TaxSavingsGoalCard, VatLimitGoalCard } from '@/components/przeplywy/finora/statistics-savings-goal-card';
import StatisticsAreaStatCard from '@/components/przeplywy/finora/statistics-area-stat-card';
import {
  CashFlowSlotCard,
  GoalSlotCard,
  InflowMonthSlotCard,
  KpirFinanceSlotCard,
  OutflowMonthSlotCard,
  PendingReviewAlert,
  PrzeplywyCardError,
  PrzeplywyGrid,
  VatSummarySlotCard,
} from '@/components/przeplywy/przeplywy-grid';
import type { PageContext } from '@/lib/supabase/page-context';
import { memoryClient, type Row } from './helpers/baza-w-pamieci';

/**
 * Strona `/przeplywy` (plan Finora P2, etap E5): strona nie liczy niczego
 * sama, a każda karta pada osobno z treścią wyjątku (§2.4 pkt 15).
 */

const TENANT = 'firma-a';
const NOW = '2026-10-20T10:00:00.000Z';

function sale(id: string, fields: Row = {}): Row {
  return {
    id, tenant_id: TENANT, direction: 'outgoing', origin: 'app', ksef_status: 'accepted', ksef_environment: 'test',
    invoice_kind: 'regular', invoice_type: 'VAT', currency: 'PLN', advance_invoice_ids: [], parent_invoice_id: null,
    issue_date: '2026-10-05', sale_date: null, net_total: 1000, vat_total: 230, gross_total: 1230,
    paid_amount: 0, paid_at: null, payment_data: null, payment_due_date: '2026-10-25', payment_status: 'unpaid',
    buyer_nip: '1234567890', buyer_data: { name: 'Alfa sp. z o.o.' }, is_b2c: false, internal_number: `FV/${id}`,
    ...fields,
  };
}

function cost(id: string, fields: Row = {}): Row {
  return {
    id, tenant_id: TENANT, source: 'manual', ksef_invoice_id: null, is_deductible: true, is_reviewed: true,
    issue_date: '2026-10-07', seller_nip: '9999999999', seller_name: 'Dostawca', document_number: 'D/1',
    category_label: 'Paliwo', document_type: 'invoice', net_amount: 100, vat_amount: 23, gross_amount: 123,
    vat_deductible_amount: 23, ocr_extracted_data: null, kpir_column: 'col_13',
    ...fields,
  };
}

function db(tables: Record<string, Row[]>) {
  return memoryClient({ tenants: [{ id: TENANT, vat_exemption_basis: null, business_started_on: null }], ...tables }) as unknown as PageContext['supabase'];
}

const props = (supabase: PageContext['supabase']) => ({ supabase, tenantId: TENANT, nowIso: NOW });

/** Element zwrócony przez kartę (ładowarka zwraca gotowy element). */
async function card(promise: Promise<unknown>): Promise<ReactElement<Record<string, unknown>>> {
  return (await promise) as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('strona /przeplywy', () => {
  it('nie czyta bazy na swoim poziomie — tylko kontekst sesji i siatka kart', async () => {
    const from = vi.fn(() => {
      throw new Error('strona nie może czytać danych sama');
    });
    mocks.context.mockResolvedValue({ supabase: { from }, tenantId: TENANT });

    const page = (await PrzeplywyPage()) as ReactElement<{ children: ReactElement[] }>;

    expect(from).not.toHaveBeenCalled();
    const children = page.props.children;
    expect(children.some((child) => (child as ReactElement).type === PrzeplywyGrid)).toBe(true);
  });

  it('siatka: każda karta w osobnej granicy błędu i Suspense', () => {
    const grid = PrzeplywyGrid(props(db({}))) as ReactElement<{ children: ReactElement[] }>;
    const slots = (grid.props.children as ReactElement[]).flatMap((child) =>
      (child.props as { title?: string }).title !== undefined
        ? [child]
        : ((child.props as { children: ReactElement[] }).children ?? []));
    const titles = slots.map((slot) => (slot.props as { title: string }).title);
    expect(titles).toEqual([
      'Przychody i koszty',
      'Wpływy i wydatki',
      'Odłóż na podatek',
      'Wpłynęło w tym miesiącu',
      'Wydano w tym miesiącu',
      'Skąd i dokąd płyną pieniądze',
      'Spodziewane wpływy',
      'Ostatnie operacje',
      'Podsumowanie podatku VAT',
      'Należności',
      'Zaległości',
      'Wszystkie operacje',
    ]);
  });
});

describe('karty: jedna karta = jedno źródło awarii', () => {
  it('faktura sprzedaży w EUR zatrzymuje karty sprzedaży, a karty ruchów działają', async () => {
    const supabase = db({
      invoices: [
        sale('eur', { currency: 'EUR' }),
        sale('paid', { paid_amount: 1230, paid_at: '2026-10-10T10:00:00Z', payment_status: 'paid' }),
      ],
      expenses: [cost('e1')],
    });

    const vat = await card(VatSummarySlotCard(props(supabase)));
    const kpir = await card(KpirFinanceSlotCard(props(supabase)));
    const chart = await card(CashFlowSlotCard(props(supabase)));
    const inflow = await card(InflowMonthSlotCard(props(supabase)));

    expect(vat.type).toBe(PrzeplywyCardError);
    expect(vat.props.title).toBe('Podsumowanie podatku VAT');
    expect(String(vat.props.message)).toMatch(/PLN/);
    expect(kpir.type).toBe(PrzeplywyCardError);
    expect(chart.type).toBe(CashFlowCard);
    expect(inflow.type).toBe(StatisticsAreaStatCard);
    expect((inflow.props.flow as { amount: number }).amount).toBe(1230);
  });

  it('przyjęta faktura bez środowiska: komunikat strażnika, nie ogólny błąd', async () => {
    const supabase = db({ invoices: [sale('x', { ksef_environment: null })], expenses: [] });

    const vat = await card(VatSummarySlotCard(props(supabase)));

    expect(vat.type).toBe(PrzeplywyCardError);
    expect(vat.props.message).toBe('Przyjęte faktury wymagają uzgodnienia środowiska KSeF');
  });

  it('dane z bazy idą do kart sprzedaży i VAT', async () => {
    const supabase = db({ invoices: [sale('a'), sale('szkic', { ksef_status: 'draft', ksef_environment: null })], expenses: [] });

    const vat = await card(VatSummarySlotCard(props(supabase)));

    expect(vat.type).toBe(VatSummaryCard);
    expect(vat.props).toMatchObject({ totalNet: 1000, totalVat: 230, totalGross: 1230, acceptedCount: 1, draftCount: 1 });
  });

  it('płatnik VAT: „Odłóż na podatek”; zwolniony podmiotowo: limit + dopisek podatku', async () => {
    const payer = await card(GoalSlotCard(props(db({ invoices: [sale('a')], expenses: [] }))));
    expect(payer.type).toBe(TaxSavingsGoalCard);
    expect((payer.props.estimate as { amount: number }).amount).toBe(190);

    const exemptDb = memoryClient({
      tenants: [{ id: TENANT, vat_exemption_basis: 'art. 113 ust. 1', business_started_on: '2024-01-01' }],
      invoices: [sale('a')],
      expenses: [],
    }) as unknown as PageContext['supabase'];
    const exempt = await card(GoalSlotCard(props(exemptDb)));
    expect(exempt.type).toBe(VatLimitGoalCard);
    expect(exempt.props.used).toBe(1000);
    expect((exempt.props.taxEstimate as { amount: number }).amount).toBe(190);
  });

  it('wydatki bez KSeF i bez kosztów: podpowiedź „Podłącz KSeF”', async () => {
    mocks.verified.mockResolvedValueOnce(false);

    const outflow = await card(OutflowMonthSlotCard(props(db({ invoices: [], expenses: [] }))));

    expect(outflow.type).toBe(StatisticsAreaStatCard);
    expect(outflow.props.empty).toMatchObject({ href: '/settings/ksef' });
  });

  it('baner wydatków do akceptacji: liczebnik i link; zero — bez banera', async () => {
    const two = (await PendingReviewAlert({
      supabase: db({ expenses: [cost('a', { is_reviewed: false }), cost('b', { is_reviewed: false })] }),
      tenantId: TENANT,
    })) as ReactElement;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const out = renderToStaticMarkup(two);
    expect(out).toContain('2 wydatki czekają na akceptację');
    expect(out).toContain('href="/expenses?filter=unreviewed"');

    expect(await PendingReviewAlert({ supabase: db({ expenses: [cost('a')] }), tenantId: TENANT })).toBeNull();
  });
});
