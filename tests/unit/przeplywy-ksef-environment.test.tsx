import { Children, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function client() {
  const invoices: Row[] = [
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'test', issue_date: '2026-09-02', net_total: 1_000, gross_total: 1_230 },
    { tenant_id: TENANT, direction: 'outgoing', ksef_status: 'accepted',
      ksef_environment: 'production', issue_date: '2026-09-03', net_total: 100, gross_total: 123 },
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
        order: () => builder,
        then: <T = { data: Row[]; count: number; error: null }, E = never>(
          resolve?: ((value: { data: Row[]; count: number; error: null }) => T | PromiseLike<T>) | null,
          reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
        ) => {
          const data = (table === 'invoices' ? invoices : []).filter((row) =>
            filters.every((filter) => filter(row)));
          return Promise.resolve({ data, count: data.length, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

beforeEach(() => vi.clearAllMocks());

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
});
