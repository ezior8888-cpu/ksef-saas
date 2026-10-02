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

function client(options: {
  expenses?: Row[];
  incomingInvoices?: Row[];
  outgoingInvoices?: Row[];
  serverCap?: number;
  withholdExactCount?: boolean;
} = {}) {
  const invoices: Row[] = [
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'test', issue_date: '2026-09-02', net_total: 1_000, gross_total: 1_230 },
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'production', issue_date: '2026-09-03', net_total: 100, gross_total: 123 },
    ...(options.incomingInvoices ?? []),
    ...(options.outgoingInvoices ?? []),
  ];
  invoices.forEach((row, index) => {
    row.id ??= `invoice-${String(index).padStart(4, '0')}`;
  });
  const invoiceFilters: Array<[string, unknown]> = [];
  const ranges: Array<{ table: string; from: number; to: number }> = [];
  return {
    invoiceFilters,
    ranges,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const ordering: string[] = [];
      let countRequested = false;
      let range: [number, number] | null = null;
      const builder = {
        select: (_columns: string, options?: { count?: string }) => {
          countRequested = options?.count === 'exact';
          return builder;
        },
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
        order: (column: string) => {
          ordering.push(column);
          return builder;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          ranges.push({ table, from, to });
          return builder;
        },
        then: <T = { data: Row[]; count: number | null; error: null }, E = never>(
          resolve?: ((value: { data: Row[]; count: number | null; error: null }) => T | PromiseLike<T>) | null,
          reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
        ) => {
          const source = table === 'invoices' ? invoices : (options.expenses ?? []).map((row, index) => ({
            ...row, id: row.id ?? `expense-${String(index).padStart(4, '0')}`,
          }));
          const matching = source.filter((row) =>
            filters.every((filter) => filter(row)));
          matching.sort((a, b) => {
            for (const column of ordering) {
              const comparison = String(a[column] ?? '').localeCompare(String(b[column] ?? ''));
              if (comparison !== 0) return comparison;
            }
            return 0;
          });
          const start = range?.[0] ?? 0;
          const requested = range ? range[1] - range[0] + 1 : Infinity;
          const data = matching.slice(start, start + Math.min(requested, options.serverCap ?? Infinity));
          return Promise.resolve({
            data,
            count: countRequested && !options.withholdExactCount ? matching.length : null,
            error: null,
          }).then(resolve, reject);
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

  it('includes all accepted invoices and deductible expenses beyond the PostgREST cap', async () => {
    const supabase = client({
      outgoingInvoices: Array.from({ length: 1200 }, (_, index) => ({
        id: `prod-${String(index).padStart(4, '0')}`,
        tenant_id: TENANT,
        direction: 'outgoing',
        ksef_status: 'accepted',
        ksef_environment: 'production',
        issue_date: '2026-09-05',
        net_total: 1,
        gross_total: 1.23,
      })),
      expenses: Array.from({ length: 1200 }, (_, index) => ({
        ...expense('manual', null, 1),
        id: `expense-${String(index).padStart(4, '0')}`,
      })),
      serverCap: 1000,
    });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    const page = await PrzeplywyPage();
    const cashFlow = Children.toArray(page.props.children)[1] as ReactElement<{
      invoices: Array<{ gross_total: number }>;
      expenses: Array<{ gross_amount: number }>;
    }>;

    expect(cashFlow.props.invoices).toHaveLength(1201);
    expect(cashFlow.props.expenses).toHaveLength(1200);
    expect(supabase.ranges).toContainEqual({ table: 'invoices', from: 500, to: 999 });
    expect(supabase.ranges).toContainEqual({ table: 'expenses', from: 500, to: 999 });
    expect(supabase.ranges).toContainEqual({ table: 'invoices', from: 1000, to: 1499 });
    expect(supabase.ranges).toContainEqual({ table: 'expenses', from: 1000, to: 1499 });
  });

  it('rejects an incomplete page instead of showing partial cash-flow totals', async () => {
    const supabase = client({
      expenses: Array.from({ length: 500 }, (_, index) => ({
        ...expense('manual', null, 1),
        id: `expense-${index}`,
      })),
      serverCap: 400,
    });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    await expect(PrzeplywyPage()).rejects.toThrow('niepełna strona danych');
  });

  it('rejects a response without an exact count', async () => {
    const supabase = client({ withholdExactCount: true });
    mocks.context.mockResolvedValue({ supabase, tenantId: TENANT });

    await expect(PrzeplywyPage()).rejects.toThrow('nie można potwierdzić liczby rekordów');
  });
});
