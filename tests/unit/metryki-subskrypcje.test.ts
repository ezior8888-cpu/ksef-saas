import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readSubscriptionCounts } from '@/lib/observability/business-metrics';

/**
 * AUD-106: tygodniowe metryki ściągały wszystkie aktywne i próbne
 * subskrypcje do pamięci, bez limitu. Teraz liczy baza (`count`, `head`).
 */

describe('liczby subskrypcji', () => {
  it('trzy zapytania count, bez pobierania wierszy', async () => {
    const calls: Array<{ head: boolean; filters: string[] }> = [];
    const counts: Record<string, number> = { 'active|monthly': 40, 'active|annual': 2, 'trialing|': 7 };
    const supabase = {
      from: () => ({
        select: (_c: string, opts: { head: boolean }) => {
          const filters: string[] = [];
          const q = {
            eq: (k: string, v: string) => { filters.push(`${k}=${v}`); return q; },
            then: (ok: (v: unknown) => unknown) => {
              calls.push({ head: opts.head, filters });
              const status = filters.find((f) => f.startsWith('status='))!.slice(7);
              const plan = filters.find((f) => f.startsWith('plan='))?.slice(5) ?? '';
              return Promise.resolve({ count: counts[`${status}|${plan}`], error: null }).then(ok);
            },
          };
          return q;
        },
      }),
    };

    const out = await readSubscriptionCounts(supabase as never);

    expect(out).toEqual({ active: 42, trialing: 7, monthlyCount: 40, annualCount: 2 });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.head)).toBe(true);
  });
});
