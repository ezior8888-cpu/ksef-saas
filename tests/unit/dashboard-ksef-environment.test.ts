import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageContext } from '@/lib/supabase/page-context';

const configured = vi.hoisted(() => ({ environment: 'production' }));
vi.mock('@/lib/ksef/claim-environment', () => ({
  requireConfiguredKsefEnvironment: () => configured.environment,
}));

import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
type Invoice = {
  tenant_id: string;
  direction: 'outgoing' | 'incoming';
  issue_date: string;
  ksef_status: string | null;
  ksef_environment: string | null;
  gross_total: number;
  net_total: number;
  vat_total: number;
};

function invoice(
  issueDate: string,
  status: string | null,
  environment: string | null,
  gross: number,
): Invoice {
  return {
    tenant_id: TENANT,
    direction: 'outgoing',
    issue_date: issueDate,
    ksef_status: status,
    ksef_environment: environment,
    gross_total: gross,
    net_total: gross / 2,
    vat_total: gross / 10,
  };
}

function queryClient(source: Invoice[]) {
  const orFilters: string[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe('invoices');
      const predicates: Array<(row: Invoice) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (column: keyof Invoice, value: string) => {
          predicates.push((row) => row[column] === value);
          return builder;
        },
        gte: (column: 'issue_date', value: string) => {
          predicates.push((row) => row[column] >= value);
          return builder;
        },
        lt: (column: 'issue_date', value: string) => {
          predicates.push((row) => row[column] < value);
          return builder;
        },
        or: (expression: string) => {
          orFilters.push(expression);
          predicates.push((row) => expression.split(',').some((condition) => {
            const [column, operator, value] = condition.split('.') as
              [keyof Invoice, string, string];
            if (operator === 'is') return row[column] === null && value === 'null';
            if (operator === 'neq') return row[column] !== null && row[column] !== value;
            if (operator === 'eq') return row[column] === value;
            throw new Error('Unexpected PostgREST predicate: ' + condition);
          }));
          return builder;
        },
        then: <T = { data: Invoice[]; error: null }, E = never>(
          resolve?: ((value: { data: Invoice[]; error: null }) => T | PromiseLike<T>) | null,
          reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
        ) => Promise.resolve({ data: source.filter((row) => predicates.every((p) => p(row))), error: null })
          .then(resolve, reject),
      };
      return builder;
    },
  } as unknown as PageContext['supabase'];
  return { client, orFilters };
}

const rows = [
  invoice('2026-09-02', 'accepted', 'test', 1_000),
  invoice('2026-09-03', 'accepted', 'demo', 2_000),
  invoice('2026-09-04', 'accepted', 'production', 100),
  invoice('2026-09-05', 'queued', null, 50),
  invoice('2026-09-06', null, null, 25),
  invoice('2026-08-02', 'accepted', 'test', 400),
  invoice('2026-08-03', 'accepted', 'production', 40),
  invoice('2025-09-02', 'accepted', 'test', 800),
  invoice('2025-09-03', 'accepted', 'production', 80),
];

beforeEach(() => { configured.environment = 'production'; });

describe('dashboard figures after a KSeF environment switch', () => {
  it('excludes TEST and DEMO accepted invoices from PROD VAT, sales and trends, keeping local pending invoices', async () => {
    const { client, orFilters } = queryClient(rows);
    const now = new Date('2026-09-15T12:00:00Z');

    const figures = await getMonthlyFigures(client, TENANT, now);
    const series = await getSalesSeries(client, TENANT, now);

    expect(figures).toMatchObject({
      issuedCount: 3,
      acceptedCount: 1,
      pendingCount: 2,
      totalGross: 175,
      totalNet: 87.5,
      totalVat: 17.5,
      prevIssuedCount: 1,
      momGrossPct: 338,
    });
    expect(series.currentSeries.at(-1)).toBe(175);
    expect(series.prevSeries.at(-1)).toBe(80);
    expect(orFilters).toHaveLength(5);
    expect(orFilters.every((filter) => filter ===
      'ksef_status.neq.accepted,ksef_status.is.null,ksef_environment.eq.production')).toBe(true);
  });

  it('also excludes PROD accepted invoices when switched back to TEST', async () => {
    configured.environment = 'test';
    const { client } = queryClient(rows);
    const figures = await getMonthlyFigures(client, TENANT, new Date('2026-09-15T12:00:00Z'));

    expect(figures).toMatchObject({
      issuedCount: 3,
      acceptedCount: 1,
      totalGross: 1_075,
      totalVat: 107.5,
    });
  });
});
