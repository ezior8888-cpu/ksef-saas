import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-088 (audyt bloku 1): masowa walidacja kontrahentów (biała lista VAT).
 *  - Job pobierał kontrahentów jednym `.in('id', [...wszystkie])`. PostgREST
 *    dostaje listę w adresie URL (ok. 39 znaków na UUID), więc przy kilkuset
 *    kontrahentach zapytanie przekracza limit długości adresu i cały job
 *    pada, zanim sprawdzi kogokolwiek — a użytkownik widzi tylko „uruchomiono”.
 *  - Błąd zapisu wyniku był ignorowany i liczony jako „zwalidowany”.
 */

const MAX_IDS_PER_QUERY = 100;
const st = vi.hoisted(() => ({
  inCalls: [] as string[][],
  updates: [] as string[],
  failUpdateFor: new Set<string>(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let updateId: string | null = null;
      let isUpdate = false;
      const q = {
        select: () => q,
        update: () => { isUpdate = true; return q; },
        eq: (k: string, v: string) => { if (k === 'id') updateId = v; return q; },
        in: (_k: string, ids: string[]) => {
          st.inCalls.push(ids);
          if (ids.length > MAX_IDS_PER_QUERY) {
            return Promise.resolve({ data: null, error: { message: '414 Request-URI Too Large' } });
          }
          return Promise.resolve({ data: ids.map((id) => ({ id, nip: '5252241585' })), error: null });
        },
        then: (ok: (v: unknown) => unknown) => {
          if (isUpdate && updateId) {
            if (st.failUpdateFor.has(updateId)) {
              return Promise.resolve({ data: null, error: { message: 'zapis odrzucony' } }).then(ok);
            }
            st.updates.push(updateId);
          }
          return Promise.resolve({ data: null, error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/validation/cache', () => ({
  validateNipCached: async () => ({ vatStatus: 'active', source: 'whitelist', bankAccounts: [], unavailable: false }),
}));
vi.mock('@/lib/jobs/events', () => ({
  inngest: { createFunction: () => ({}) },
  validationBulkContractorsRequested: { create: (d: unknown) => d },
}));

import { runBulkValidateContractors } from '@/lib/jobs/runners/bulk-validate-contractors';
import type { JobContext } from '@/lib/jobs/registry';

const ctx = {
  step: { run: async (_n: string, fn: () => unknown) => fn(), sleep: async () => undefined },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  attempt: 0,
} as unknown as JobContext;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

beforeEach(() => {
  st.inCalls = [];
  st.updates = [];
  st.failUpdateFor = new Set();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('masowa walidacja kontrahentów (F-088)', () => {
  it('250 kontrahentów: zapytania w paczkach, wszyscy sprawdzeni', async () => {
    const all = ids(250);
    const r = await runBulkValidateContractors(
      { tenantId: 'ten-1', contractorIds: all, forceRefresh: false, triggeredBy: 'u-1' },
      ctx,
    );
    expect(st.inCalls.every((c) => c.length <= MAX_IDS_PER_QUERY)).toBe(true);
    expect(st.updates).toHaveLength(250);
    expect(r).toMatchObject({ success: true, validated: 250 });
  });

  it('nieudany zapis nie jest liczony jako zwalidowany i nie zatrzymuje reszty', async () => {
    const all = ids(3);
    st.failUpdateFor.add(all[1]!);
    const r = await runBulkValidateContractors(
      { tenantId: 'ten-1', contractorIds: all, forceRefresh: false, triggeredBy: 'u-1' },
      ctx,
    );
    expect(st.updates).toEqual([all[0], all[2]]);
    expect(r).toMatchObject({ validated: 2 });
  });
});
