import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageContext } from '@/lib/supabase/page-context';

const configured = vi.hoisted(() => ({ environment: 'production' }));
vi.mock('@/lib/ksef/claim-environment', () => ({
  requireConfiguredKsefEnvironment: () => configured.environment,
}));

import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
type Invoice = {
  id: string;
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
  id = `${issueDate}-${status ?? 'legacy'}-${environment ?? 'unknown'}-${gross}`,
): Invoice {
  return {
    id,
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

function queryClient(source: Invoice[], failRangeStart?: number) {
  const ranges: Array<[number, number]> = [];
  const invoiceQueries: Array<{ filters: Array<[string, unknown]>; orders: string[] }> = [];
  const client = {
    from(table: string) {
      expect(table).toBe('invoices');
      const predicates: Array<(row: Invoice) => boolean> = [];
      const filters: Array<[string, unknown]> = [];
      const orders: string[] = [];
      let head = false;
      let range: [number, number] | null = null;
      const builder = {
        select: (_columns: string, options?: { head?: boolean }) => {
          head = options?.head ?? false;
          return builder;
        },
        eq: (column: keyof Invoice, value: string) => {
          filters.push([column, value]);
          predicates.push((row) => row[column] === value);
          return builder;
        },
        is: (column: keyof Invoice, value: null) => {
          filters.push([column, value]);
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
        order: (column: string) => {
          orders.push(column);
          return builder;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          ranges.push(range);
          return builder;
        },
        then: <T = { data: Invoice[] | null; count: number | null; error: { message: string } | null }, E = never>(
          resolve?: ((value: { data: Invoice[] | null; count: number | null; error: { message: string } | null }) => T | PromiseLike<T>) | null,
          reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
        ) => {
          invoiceQueries.push({ filters, orders });
          const matching = source.filter((row) => predicates.every((p) => p(row)))
            .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));
          const result = failRangeStart !== undefined && range?.[0] === failRangeStart
            ? { data: null, count: null, error: { message: 'read failure' } }
            : head
              ? { data: null, count: matching.length, error: null }
              : { data: matching.slice(range?.[0] ?? 0, Math.min((range?.[1] ?? 999) + 1, (range?.[0] ?? 0) + 1000)), count: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as PageContext['supabase'];
  return { client, ranges, invoiceQueries };
}

const rows = [
  invoice('2026-09-02', 'accepted', 'test', 1_000),
  invoice('2026-09-03', 'accepted', 'demo', 2_000),
  invoice('2026-09-04', 'accepted', 'production', 100),
  // Submitted in TEST before the switch: invoices has no trusted queue environment.
  invoice('2026-09-05', 'queued', null, 50),
  invoice('2026-09-06', 'offline_queued', null, 500),
  invoice('2026-09-07', 'draft', null, 25),
  invoice('2026-09-08', 'draft', 'test', 75),
  invoice('2026-08-02', 'accepted', 'test', 400),
  invoice('2026-08-03', 'accepted', 'production', 40),
  invoice('2025-09-02', 'accepted', 'test', 800),
  invoice('2025-09-03', 'accepted', 'production', 80),
];

beforeEach(() => { configured.environment = 'production'; });

describe('dashboard figures after a KSeF environment switch', () => {
  it('uses only PROD accepted invoices for money and keeps local drafts separate', async () => {
    const { client, invoiceQueries } = queryClient(rows);
    const now = new Date('2026-09-15T12:00:00Z');

    const figures = await getMonthlyFigures(client, TENANT, now);
    const series = await getSalesSeries(client, TENANT, now);

    expect(figures).toMatchObject({
      acceptedCount: 1,
      draftCount: 1,
      totalGross: 100,
      totalNet: 50,
      totalVat: 10,
      prevAcceptedCount: 1,
      momGrossPct: 150,
    });
    expect(series.currentSeries.at(-1)).toBe(100);
    expect(series.prevSeries.at(-1)).toBe(80);
    const monetaryQueries = invoiceQueries.filter((query) =>
      query.filters.some(([column, value]) =>
        column === 'ksef_environment' && value === 'production'));
    expect(monetaryQueries).toHaveLength(3);
    expect(monetaryQueries.every((query) =>
      query.filters.some(([column, value]) =>
        column === 'ksef_status' && value === 'accepted'))).toBe(true);
    expect(monetaryQueries.every((query) =>
      query.orders.join(',') === 'issue_date,id')).toBe(true);
  });

  it('also excludes PROD accepted invoices when switched back to TEST', async () => {
    configured.environment = 'test';
    const { client } = queryClient(rows);
    const figures = await getMonthlyFigures(client, TENANT, new Date('2026-09-15T12:00:00Z'));

    expect(figures).toMatchObject({
      acceptedCount: 1,
      draftCount: 1,
      totalGross: 1_000,
      totalVat: 100,
    });
  });

  it('stops both monetary views when an accepted historical invoice has no environment', async () => {
    const { client } = queryClient([
      ...rows,
      invoice('2026-09-09', 'accepted', null, 300),
    ]);
    const now = new Date('2026-09-15T12:00:00Z');

    await expect(getMonthlyFigures(client, TENANT, now)).rejects.toThrow(
      'Przyjęte faktury wymagają uzgodnienia środowiska KSeF',
    );
    await expect(getSalesSeries(client, TENANT, now)).rejects.toThrow(
      'Przyjęte faktury wymagają uzgodnienia środowiska KSeF',
    );
  });

  it('checks the prior-year comparison window for unknown accepted provenance', async () => {
    const { client } = queryClient([
      ...rows,
      invoice('2025-09-09', 'accepted', null, 300),
    ]);

    await expect(getSalesSeries(
      client, TENANT, new Date('2026-09-15T12:00:00Z'),
    )).rejects.toThrow('Przyjęte faktury wymagają uzgodnienia środowiska KSeF');
  });

  it('reads all 1200 accepted invoices despite the 1000-row PostgREST limit', async () => {
    const bulk = Array.from({ length: 1200 }, (_, index) =>
      invoice('2026-09-10', 'accepted', 'production', 10, String(index).padStart(4, '0')));
    const { client, ranges } = queryClient(bulk);
    const now = new Date('2026-09-15T12:00:00Z');

    const figures = await getMonthlyFigures(client, TENANT, now);
    const series = await getSalesSeries(client, TENANT, now);

    expect(figures).toMatchObject({
      acceptedCount: 1200,
      totalNet: 6000,
      totalVat: 1200,
      totalGross: 12000,
    });
    expect(series.currentSeries.at(-1)).toBe(12000);
    expect(ranges).toContainEqual([0, 999]);
    expect(ranges).toContainEqual([1000, 1999]);
  });

  it('fails the monthly amount instead of returning the first page after a later read error', async () => {
    const bulk = Array.from({ length: 1200 }, (_, index) =>
      invoice('2026-09-10', 'accepted', 'production', 10, String(index).padStart(4, '0')));
    const { client } = queryClient(bulk, 1000);

    await expect(getMonthlyFigures(
      client, TENANT, new Date('2026-09-15T12:00:00Z'),
    )).rejects.toThrow('Nie można odczytać liczb miesiąca');
  });
});
