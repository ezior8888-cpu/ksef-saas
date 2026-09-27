import { Children, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.context }));
vi.mock('@/lib/ksef/claim-environment', () => ({
  requireConfiguredKsefEnvironment: () => 'production',
}));
vi.mock('@/lib/dashboard/monthly-figures', () => ({
  formatPlMoney: (value: number) => String(value),
  formatPlInt: (value: number) => String(value),
  getMonthlyFigures: async () => ({
    monthName: 'wrzesień 2026', totalNet: 0, totalVat: 0, totalGross: 0,
    vatDueLabel: '25.10.2026', daysToVatDue: 25,
  }),
  getSalesSeries: async () => ({
    months: [], currentSeries: [], prevSeries: [], currentMonthKey: '2026-09',
  }),
}));

import PrzeplywyPage from '@/app/(dashboard)/przeplywy/page';

type Row = Record<string, unknown>;
const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function expense(source: string, invoiceId: string | null, gross: number): Row {
  return { tenant_id: TENANT, source, ksef_invoice_id: invoiceId,
    issue_date: '2026-09-04', is_deductible: true, gross_amount: gross,
    net_amount: gross, vat_amount: 0, vat_deductible_amount: 0,
    document_type: 'invoice', kpir_column: 'col_13' };
}

function client(options: { expenses?: Row[]; incomingInvoices?: Row[] } = {}) {
  const invoices: Row[] = [
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'test', issue_date: '2026-09-02', net_total: 1_000, gross_total: 1_230 },
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'production', issue_date: '2026-09-03', net_total: 100, gross_total: 123 },
    ...(options.incomingInvoices ?? []),
  ];
  const invoiceFilters: Array<[string, unknown]> = [];
  return {
    invoiceFilters,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          if (table === 'invoices') invoiceFilters.push([column, value]);
          filters.push((row) => row[column] === value);
          return builder;
        },
        gte: (column: string, value: string) => {
          filters.push((row) => String(row[column]) >= value);
          return builder;
        },
        in: (column: string, values: string[]) => {
          filters.push((row) => values.includes(String(row[column])));
          return builder;
        },
        order: () => builder,
        then: <T = { data: Row[]; count: number; error: null }, E = never>(
          resolve?: ((value: { data: Row[]; count: number; error: null }) => T | PromiseLike<T>) | null,
          reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
        ) => {
          const source = table === 'invoices' ? invoices : (options.expenses ?? []);
          const data = source.filter((row) =>
            filters.every((filter) => filter(row)));
          return Promise.resolve({ data, count: data.length, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('cash flow after switching from TEST to PROD', () => {
  it('passes only accepted production invoices to the revenue calculation', async () => {
    const supabase = client();
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    const page = await PrzeplywyPage();
    const children = Children.toArray(page.props.children);
    const cashFlow = children[1] as ReactElement<{
      invoices: Array<{ gross_total: number }>;
    }>;

    expect(supabase.invoiceFilters).toContainEqual(['ksef_environment', 'production']);
    expect(cashFlow.props.invoices).toEqual([expect.objectContaining({ gross_total: 123 })]);
  });

  it('keeps manual and OCR costs, but excludes TEST and DEMO KSeF-linked costs', async () => {
    const supabase = client({
      expenses: [
        expense('manual', null, 10),
        expense('ocr_photo', null, 20),
        expense('ksef_inbox', 'test-in', 1_000),
        expense('ksef_inbox', 'demo-in', 2_000),
        expense('ksef_inbox', 'prod-in', 30),
      ],
      incomingInvoices: [
        { id: 'test-in', tenant_id: TENANT, direction: 'incoming',
          ksef_status: 'accepted', ksef_environment: 'test' },
        { id: 'demo-in', tenant_id: TENANT, direction: 'incoming',
          ksef_status: 'accepted', ksef_environment: 'demo' },
        { id: 'prod-in', tenant_id: TENANT, direction: 'incoming',
          ksef_status: 'accepted', ksef_environment: 'production' },
      ],
    });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    const page = await PrzeplywyPage();
    const cashFlow = Children.toArray(page.props.children)[1] as ReactElement<{
      expenses: Array<{ gross_amount: number }>;
    }>;

    expect(cashFlow.props.expenses.map((row) => row.gross_amount)).toEqual([10, 20, 30]);
    expect(supabase.invoiceFilters).toContainEqual(['tenant_id', TENANT]);
  });

  it('stops the cash-flow read when a KSeF cost has no verifiable linked invoice', async () => {
    const supabase = client({ expenses: [expense('ksef_inbox', 'missing-in', 500)] });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    await expect(PrzeplywyPage()).rejects.toThrow(
      'KSeF expense invoice is missing from this organization',
    );
  });

  it('stops the cash-flow read when a linked invoice has no environment provenance', async () => {
    const supabase = client({
      expenses: [expense('ksef_inbox', 'unknown-env', 500)],
      incomingInvoices: [{ id: 'unknown-env', tenant_id: TENANT, direction: 'incoming',
        ksef_status: 'accepted', ksef_environment: null }],
    });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    await expect(PrzeplywyPage()).rejects.toThrow(
      'KSeF expense invoice requires environment reconciliation',
    );
  });
});
