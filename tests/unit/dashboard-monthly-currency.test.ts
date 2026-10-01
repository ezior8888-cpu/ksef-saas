import { describe, expect, it } from 'vitest';

import { OutgoingInvoiceCurrencyNotSupportedError } from '@/lib/exports/currency-guard';
import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';
import type { PageContext } from '@/lib/supabase/page-context';

type Row = Record<string, unknown>;
type QueryPlan = { rows: Row[]; error?: { message: string } };

/** Zwraca tylko kolumny wybrane przez kod, jak PostgREST. */
function database(plans: QueryPlan[]): PageContext['supabase'] {
  let nextQuery = 0;
  return {
    from(table: string) {
      if (table !== 'invoices') throw new Error(`Unexpected table: ${table}`);
      const plan = plans[nextQuery++];
      if (!plan) throw new Error('Unexpected query');
      let columns: string[] = [];
      const query = {
        select(selection: string) {
          columns = selection.split(',').map((column) => column.trim());
          return query;
        },
        eq() { return query; },
        gte() { return query; },
        lt() { return query; },
        then(
          resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          const rows = plan.rows.map((row) =>
            Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
          return Promise.resolve({ data: plan.error ? null : rows, error: plan.error ?? null })
            .then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as PageContext['supabase'];
}

const NOW = new Date('2026-09-15T12:00:00Z');
const monthlyPlans = (): QueryPlan[] => [
  { rows: [{ gross_total: 123, net_total: 100, vat_total: 23, ksef_status: 'pending', currency: 'PLN' }] },
  { rows: [{ gross_total: 80, currency: 'PLN' }] },
  { rows: [{ gross_total: 123, issue_date: '2026-09-03', currency: 'PLN' }] },
];
const seriesPlans = (): QueryPlan[] => [
  { rows: [{ gross_total: 123, issue_date: '2026-09-03', currency: 'PLN' }] },
  { rows: [{ gross_total: 80, issue_date: '2025-09-03', currency: 'PLN' }] },
];

describe('dashboard: sumy tylko z potwierdzonych kwot PLN', () => {
  it('liczy prawidłowe faktury PLN', async () => {
    const monthly = await getMonthlyFigures(database(monthlyPlans()), 'tenant-1', NOW);
    expect(monthly).toMatchObject({ issuedCount: 1, pendingCount: 1, totalGross: 123 });

    const series = await getSalesSeries(database(seriesPlans()), 'tenant-1', NOW);
    expect(series.currentSeries.at(-1)).toBe(123);
    expect(series.prevSeries.at(-1)).toBe(80);
  });

  it.each([
    ['bieżący miesiąc EUR', 0, 'EUR'],
    ['poprzedni miesiąc bez waluty', 1, undefined],
    ['suma roku EUR', 2, 'EUR'],
  ] as const)('karty: %s zatrzymuje agregację', async (_opis, queryIndex, currency) => {
    const plans = monthlyPlans();
    plans[queryIndex]!.rows[0]!.currency = currency;
    await expect(getMonthlyFigures(database(plans), 'tenant-1', NOW))
      .rejects.toThrow(OutgoingInvoiceCurrencyNotSupportedError);
  });

  it.each([
    ['bieżący rok EUR', 0, 'EUR'],
    ['poprzedni rok bez waluty', 1, undefined],
  ] as const)('wykres: %s zatrzymuje agregację', async (_opis, queryIndex, currency) => {
    const plans = seriesPlans();
    plans[queryIndex]!.rows[0]!.currency = currency;
    await expect(getSalesSeries(database(plans), 'tenant-1', NOW))
      .rejects.toThrow(OutgoingInvoiceCurrencyNotSupportedError);
  });

  it.each([0, 1, 2])('karty: błąd odczytu zapytania %i nie staje się zerem', async (queryIndex) => {
    const plans = monthlyPlans();
    plans[queryIndex] = { rows: [], error: { message: 'database failure' } };
    await expect(getMonthlyFigures(database(plans), 'tenant-1', NOW)).rejects.toThrow();
  });

  it.each([0, 1])('wykres: błąd odczytu zapytania %i nie staje się zerem', async (queryIndex) => {
    const plans = seriesPlans();
    plans[queryIndex] = { rows: [], error: { message: 'database failure' } };
    await expect(getSalesSeries(database(plans), 'tenant-1', NOW)).rejects.toThrow();
  });
});
