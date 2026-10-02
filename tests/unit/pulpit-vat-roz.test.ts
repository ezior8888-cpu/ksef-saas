import { beforeEach, describe, expect, it } from 'vitest';

import type { PageContext } from '@/lib/supabase/page-context';
import { getMonthlyFigures, getSalesSeries } from '@/lib/dashboard/monthly-figures';

/**
 * AUD-26: faktura rozliczeniowa (ROZ) trzyma w `net_total`/`vat_total`/
 * `gross_total` PEŁNE zamówienie, a VAT zaliczki był już należny w miesiącu
 * zaliczki. Pulpit sumował jedno i drugie — „VAT należny” i „Sprzedaż brutto”
 * miesiąca z ROZ były zawyżone o zaliczki. Liczymy jak KPiR i JPK: z ROZ
 * tylko reszta ponad przyjęte zaliczki tej firmy.
 */

type Row = Record<string, unknown>;

let rows: Row[];
let failAdvances: boolean;

function database(): PageContext['supabase'] {
  return {
    from(table: string) {
      const predicates: Array<(row: Row) => boolean> = [];
      let columns: string[] | null = null;
      let advanceLookup = false;
      // Jak PostgREST: liczba rekordów, sortowanie i strony (komplet stron z #71).
      let head = false;
      let sortKey: string | null = null;
      let window: [number, number] | null = null;
      const query = {
        select(selection = '*', options?: { head?: boolean }) {
          const parts = selection.split(',').map((s) => s.trim()).filter(Boolean);
          columns = parts.includes('*') ? null : parts;
          head = Boolean(options?.head);
          return query;
        },
        is(key: string, value: unknown) {
          predicates.push((r) => (value === null ? r[key] == null : r[key] === value));
          return query;
        },
        or(filter: string) {
          const m = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(filter);
          if (!m) throw new Error(`Unexpected OR filter ${filter}`);
          predicates.push((r) => r.ksef_environment == null || r.ksef_environment !== m[1]);
          return query;
        },
        range(from: number, to: number) { window = [from, to]; return query; },
        eq(key: string, value: unknown) {
          if (key === 'invoice_kind' && value === 'advance') advanceLookup = true;
          predicates.push((r) => r[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) { predicates.push((r) => values.includes(r[key])); return query; },
        gte(key: string, value: string) { predicates.push((r) => String(r[key]) >= value); return query; },
        lt(key: string, value: string) { predicates.push((r) => String(r[key]) < value); return query; },
        order(key: string) { sortKey = key; return query; },
        then(resolve: (v: unknown) => unknown) {
          if (table !== 'invoices') return Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
          if (advanceLookup && failAdvances) {
            return Promise.resolve({ data: null, error: { message: 'timeout' } }).then(resolve);
          }
          // Atrapa zwraca TYLKO wybrane kolumny: brak `advance_invoice_ids`
          // w zapytaniu pulpitu byłby inaczej niewidoczny.
          const matching = rows.filter((r) => predicates.every((p) => p(r)));
          if (sortKey) {
            const k = sortKey;
            matching.sort((a, b) => String(a[k]).localeCompare(String(b[k])));
          }
          const page = window ? matching.slice(window[0], window[1] + 1) : matching;
          const data = page.map((r) => (columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : r));
          return Promise.resolve({ data: head ? null : data, count: matching.length, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as PageContext['supabase'];
}

const TENANT = 'firma-a';
const NOW = new Date(2026, 8, 15, 12); // 15 września 2026

function invoice(id: string, fields: Row): Row {
  return {
    id,
    tenant_id: TENANT,
    direction: 'outgoing',
    ksef_status: 'accepted',
    ksef_environment: 'test',
    invoice_kind: 'vat',
    advance_invoice_ids: null,
    currency: 'PLN',
    ...fields,
  };
}

const zaliczkaSierpien = invoice('zal-1', {
  invoice_kind: 'advance',
  issue_date: '2026-08-10',
  net_total: 10000,
  vat_total: 2300,
  gross_total: 12300,
});
const rozWrzesien = invoice('roz-1', {
  invoice_kind: 'final',
  advance_invoice_ids: ['zal-1'],
  issue_date: '2026-09-05',
  net_total: 30000,
  vat_total: 6900,
  gross_total: 36900,
});
const zwyklaWrzesien = invoice('vat-1', {
  issue_date: '2026-09-03',
  net_total: 1000,
  vat_total: 230,
  gross_total: 1230,
});

describe('pulpit — ROZ bez zaliczek liczonych drugi raz (AUD-26)', () => {
  beforeEach(() => {
    rows = [zaliczkaSierpien, rozWrzesien, zwyklaWrzesien];
    failAdvances = false;
  });

  it('VAT, netto i brutto miesiąca z ROZ to reszta ponad zaliczkę z poprzedniego miesiąca', async () => {
    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    expect(figures.totalNet).toBe(21000);
    expect(figures.totalVat).toBe(4830);
    expect(figures.totalGross).toBe(25830);
  });

  it('zaliczka i ROZ w tym samym miesiącu dają razem pełne zamówienie, nie więcej', async () => {
    rows = [{ ...zaliczkaSierpien, issue_date: '2026-09-01' }, rozWrzesien, zwyklaWrzesien];

    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    expect(figures.totalNet).toBe(31000);
    expect(figures.totalVat).toBe(7130);
    expect(figures.totalGross).toBe(38130);
  });

  it('porównania miesięcy liczą to samo: najlepszy miesiąc i zmiana m/m bez dubla', async () => {
    rows = [
      zaliczkaSierpien,
      { ...rozWrzesien, issue_date: '2026-08-20' },
      invoice('vat-wrz', { issue_date: '2026-09-03', net_total: 30000, vat_total: 6900, gross_total: 36900 }),
    ];

    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    // Sierpień: zaliczka 12 300 + reszta ROZ 24 600 = całe zamówienie 36 900,
    // tyle samo co wrzesień. Z dublem sierpień miałby 49 200 i wyszłoby -25%.
    expect(figures.totalGross).toBe(36900);
    expect(figures.momGrossPct).toBe(0);
  });

  it('miesiąc z samą resztą ROZ nie przegrywa „najlepszego miesiąca” z własnym dublem', async () => {
    rows = [
      invoice('vat-lip', { issue_date: '2026-07-10', net_total: 20000, vat_total: 4600, gross_total: 24600 }),
      zaliczkaSierpien,
      rozWrzesien,
    ];

    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    // Wrzesień: 24 600 (reszta ROZ) = lipiec 24 600 → remis to też najlepszy wynik.
    expect(figures.totalGross).toBe(24600);
    expect(figures.isBestMonthOfYear).toBe(true);
  });

  it('nieprzyjęta zaliczka nic nie odejmuje — jak w KPiR i JPK', async () => {
    rows = [{ ...zaliczkaSierpien, ksef_status: 'draft' }, rozWrzesien, zwyklaWrzesien];

    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    expect(figures.totalVat).toBe(7130);
  });

  it('zaliczka innej firmy w tablicy ROZ nic nie odejmuje', async () => {
    rows = [{ ...zaliczkaSierpien, tenant_id: 'firma-b' }, rozWrzesien, zwyklaWrzesien];

    const figures = await getMonthlyFigures(database(), TENANT, NOW);

    expect(figures.totalVat).toBe(7130);
  });

  it('błąd odczytu zaliczek przerywa, zamiast pokazać zawyżony VAT', async () => {
    failAdvances = true;

    await expect(getMonthlyFigures(database(), TENANT, NOW)).rejects.toThrow(/zaliczek/);
  });

  it('wykres sprzedaży liczy miesiąc ROZ tak samo jak karta', async () => {
    const series = await getSalesSeries(database(), TENANT, NOW);
    const idx = (key: string) => series.months.findIndex((m) => m.key === key);

    expect(series.currentSeries[idx('2026-08')]).toBe(12300);
    expect(series.currentSeries[idx('2026-09')]).toBe(25830);
  });
});
