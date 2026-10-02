import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readWrappedInput } from '@/app/(dashboard)/flo/wrapped/data';

/**
 * AUD-120: podsumowanie roku czytało faktury jednym zapytaniem. PostgREST
 * oddaje najwyżej 1000 wierszy (`max-rows`) BEZ błędu — firma z 1500
 * fakturami widziała rok uciętego o jedną trzecią, a „najdłuższa współpraca”
 * liczyła się od pierwszych 1000 faktur historii.
 */

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

let rows: Row[];
let requestedRanges: Array<[number, number]>;

function database(): SupabaseClient {
  return {
    from() {
      const predicates: Array<(row: Row) => boolean> = [];
      const orders: Array<[string, boolean]> = [];
      let window: [number, number] | null = null;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { predicates.push((r) => r[key] === value); return query; },
        gte(key: string, value: string) { predicates.push((r) => String(r[key]) >= value); return query; },
        lt(key: string, value: string) { predicates.push((r) => String(r[key]) < value); return query; },
        order(key: string, opts?: { ascending?: boolean }) { orders.push([key, opts?.ascending !== false]); return query; },
        limit() { return query; },
        range(from: number, to: number) { window = [from, to]; requestedRanges.push(window); return query; },
        then(resolve: (v: unknown) => unknown) {
          let data = rows.filter((r) => predicates.every((p) => p(r)));
          data = [...data].sort((a, b) => {
            for (const [key, asc] of orders) {
              const cmp = String(a[key]).localeCompare(String(b[key]));
              if (cmp !== 0) return asc ? cmp : -cmp;
            }
            return 0;
          });
          const [from, to] = window ?? [0, Number.MAX_SAFE_INTEGER];
          // Jak PostgREST z `max-rows`: nigdy więcej niż 1000, bez błędu.
          data = data.slice(from, Math.min(to + 1, from + MAX_ROWS));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

function invoice(i: number, issueDate: string, buyerNip: string): Row {
  return {
    id: `inv-${String(i).padStart(6, '0')}`,
    tenant_id: 'firma-a',
    direction: 'outgoing',
    issue_date: issueDate,
    gross_total: 100,
    ksef_status: 'accepted',
    paid_at: null,
    payment_due_date: null,
    buyer_nip: buyerNip,
    buyer_data: { name: `Kontrahent ${buyerNip}` },
    origin: 'app',
  };
}

describe('podsumowanie roku — wszystkie faktury, nie pierwsze 1000 (AUD-120)', () => {
  beforeEach(() => {
    requestedRanges = [];
    rows = [];
  });

  it('1500 faktur w roku liczy się w całości', async () => {
    for (let i = 0; i < 1500; i++) {
      rows.push(invoice(i, `2026-${String((i % 12) + 1).padStart(2, '0')}-10`, '1234567890'));
    }

    const input = await readWrappedInput(database(), 'firma-a', 2026);

    const total = input.months.reduce((sum, m) => sum + m.invoiceCount, 0);
    expect(total).toBe(1500);
    expect(input.contractors[0]?.gross).toBe(150_000);
  });

  it('pierwsza faktura kontrahenta sprzed 1000 innych faktur historii wyznacza start współpracy', async () => {
    rows.push(invoice(0, '2015-03-01', '1111111111'));
    for (let i = 1; i <= 1200; i++) rows.push(invoice(i, '2016-01-01', '2222222222'));
    rows.push(invoice(5000, '2026-05-05', '1111111111'));
    // Kontrahent, którego pierwsza faktura leży za granicą 1000 wierszy historii.
    rows.push(invoice(5001, '2017-07-07', '3333333333'));
    rows.push(invoice(5002, '2026-06-06', '3333333333'));

    const input = await readWrappedInput(database(), 'firma-a', 2026);

    const byId = new Map(input.contractors.map((c) => [c.id, c]));
    expect(byId.get('1111111111')?.firstInvoiceMonth).toBe('2015-03');
    expect(byId.get('3333333333')?.firstInvoiceMonth).toBe('2017-07');
  });
});
