import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * Awaria API Białej Listy / VIES (timeout, limit zapytań, błąd serwera) to
 * „nie wiemy”, a nie „nieaktywny bez rachunków”. Do 01.10.2026 taki wynik:
 *  - trafiał do `validation_cache` na 24 h (formularze widziały „nieznany”),
 *  - nocna re-walidacja zapisywała go kontrahentowi: status VAT i zweryfikowane
 *    rachunki znikały, a `last_validation_at` odsuwał kolejną próbę o 7 dni.
 */

const state = vi.hoisted(() => ({
  whitelist: vi.fn(),
  vies: vi.fn(),
  dbRow: null as Record<string, unknown> | null,
  redis: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  redisSets: [] as unknown[],
  contractorUpdates: [] as Array<{ patch: Record<string, unknown>; id: unknown }>,
  contractors: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/validation/whitelist-client', () => ({ checkNipInWhitelist: state.whitelist }));
vi.mock('@/lib/validation/vies-client', () => ({ checkVatInVies: state.vies }));
vi.mock('@/lib/cache', () => ({
  // Jak prawdziwe `cached()`: wynik loadera (bazy) trafia do Redisa.
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => {
    if (state.redis) return state.redis;
    const fresh = await loader();
    if (fresh != null) state.redisSets.push(fresh);
    return fresh;
  },
  cacheDel: vi.fn(async () => undefined),
  cacheSet: vi.fn(async (_k: string, v: unknown) => { state.redisSets.push(v); }),
  cacheKeys: { nipValidation: (nip: string, cc: string) => `nip:${cc}:${nip}` },
  TTL_SECONDS: { nipValidation: 86400 },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: 0, error: null }),
    from: (table: string) => {
      const eqs: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      let isUpdate = false;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; },
        in: () => q,
        gt: () => q,
        not: () => q,
        or: () => q,
        order: () => q,
        limit: async () => ({ data: state.contractors, error: null }),
        maybeSingle: async () => ({ data: state.dbRow, error: null }),
        upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null }; },
        update: (p: Record<string, unknown>) => { patch = p; isUpdate = true; return q; },
        then: (ok: (v: unknown) => unknown) => {
          if (table === 'contractors' && !isUpdate) {
            return Promise.resolve({ data: state.contractors, error: null }).then(ok);
          }
          if (table === 'contractors' && isUpdate && eqs.length === 2) {
            state.contractorUpdates.push({ patch: patch ?? {}, id: eqs.find(([k]) => k === 'id')?.[1] });
          }
          return Promise.resolve({ error: null }).then(ok);
        },
      });
      return q;
    },
  }),
}));

import { validateNipCached } from '@/lib/validation/cache';
import { contractorValidationPatch } from '@/lib/validation/contractor-update';
import { runNightlyValidationRecheck } from '@/lib/inngest/jobs/nightly-validation-recheck';
import { runBulkValidateContractors } from '@/lib/inngest/jobs/bulk-validate-contractors';

const NIP = '5260001246';
const OK = {
  success: true, nip: NIP, legalName: 'Firma', vatStatus: 'active',
  bankAccounts: ['61109010140000071219812874'],
};
const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  state.whitelist.mockReset();
  state.vies.mockReset();
  state.dbRow = null;
  state.redis = null;
  state.upserts = [];
  state.redisSets = [];
  state.contractorUpdates = [];
  state.contractors = [];
});

describe('cache walidacji a awaria API', () => {
  it.each(['TIMEOUT', 'RATE_LIMIT', 'API_ERROR'])('Biała Lista %s — „nie wiemy”, bez zapisu do cache', async (errorCode) => {
    state.whitelist.mockResolvedValue({ success: false, error: 'Biała Lista nie odpowiada', errorCode });
    const r = await validateNipCached(NIP);
    expect(r).toMatchObject({ unavailable: true, vatStatus: 'unknown' });
    expect(state.upserts).toHaveLength(0);
    expect(state.redisSets).toHaveLength(0);
  });

  it.each(['TIMEOUT', 'SERVICE_DOWN', 'API_ERROR'])('VIES %s — tak samo', async (errorCode) => {
    state.vies.mockResolvedValue({ success: false, error: 'VIES nie odpowiada', errorCode });
    const r = await validateNipCached('123456789', 'DE');
    expect(r.unavailable).toBe(true);
    expect(state.upserts).toHaveLength(0);
  });

  it('błędny NIP to wynik trwały, nie awaria — zapis jak dotąd', async () => {
    state.whitelist.mockResolvedValue({ success: false, error: 'NIP musi mieć 10 cyfr', errorCode: 'INVALID_NIP' });
    const r = await validateNipCached('123');
    expect(r.unavailable).toBe(false);
    expect(state.upserts).toHaveLength(1);
  });

  it('odpowiedź API — zapis do bazy i Redisa', async () => {
    state.whitelist.mockResolvedValue(OK);
    expect(await validateNipCached(NIP)).toMatchObject({ vatStatus: 'active', isValid: true });
    expect(state.upserts).toHaveLength(1);
    expect(state.redisSets).toHaveLength(1);
  });

  it('„unknown” w cache (ślad dawnej awarii) nie jest odpowiedzią — pytamy API', async () => {
    state.dbRow = { id: 'c1', nip: NIP, country_code: 'PL', vat_status: 'unknown', is_valid: false, bank_accounts: [], cached_at: '2026-10-01' };
    state.whitelist.mockResolvedValue(OK);
    expect(await validateNipCached(NIP)).toMatchObject({ vatStatus: 'active' });
    expect(state.whitelist).toHaveBeenCalledOnce();
    // Do Redisa idzie tylko świeży wynik, nie „unknown” z bazy.
    expect(state.redisSets).toEqual([expect.objectContaining({ vatStatus: 'active' })]);
  });

  it('„unknown” w Redisie — też pytamy API', async () => {
    state.redis = { nip: NIP, vatStatus: 'unknown', bankAccounts: [], fromCache: true, source: 'whitelist', isValid: false, countryCode: 'PL' };
    state.whitelist.mockResolvedValue(OK);
    expect(await validateNipCached(NIP)).toMatchObject({ vatStatus: 'active' });
  });

  it('dobry wynik z cache wraca bez pytania API', async () => {
    state.dbRow = { id: 'c1', nip: NIP, country_code: 'PL', vat_status: 'active', is_valid: true, bank_accounts: [], cached_at: '2026-10-01' };
    expect(await validateNipCached(NIP)).toMatchObject({ vatStatus: 'active', fromCache: true });
    expect(state.whitelist).not.toHaveBeenCalled();
  });
});

describe('zapis do kontrahenta', () => {
  it('awaria API — brak zapisu', () => {
    expect(contractorValidationPatch({ nip: NIP, countryCode: 'PL', isValid: false, vatStatus: 'unknown', bankAccounts: [], fromCache: false, source: 'whitelist', unavailable: true })).toBeNull();
  });

  it('wynik — pełny zapis z datą', () => {
    const now = new Date('2026-10-01T04:00:00Z');
    expect(contractorValidationPatch({ nip: NIP, countryCode: 'PL', isValid: true, vatStatus: 'active', bankAccounts: ['1'], fromCache: false, source: 'whitelist', warning: 'x' }, now)).toEqual({
      vat_status: 'active', last_validation_at: '2026-10-01T04:00:00.000Z', last_validation_source: 'whitelist', bank_accounts_validated: ['1'], validation_warning: 'x',
    });
  });

  it('nocna re-walidacja: kontrahent z awarią API zostaje nietknięty, drugi dostaje wynik', async () => {
    state.contractors = [
      { id: 'k-awaria', nip: NIP, tenant_id: 't1', vat_status: 'active' },
      { id: 'k-ok', nip: '7740001454', tenant_id: 't1', vat_status: 'active' },
    ];
    state.whitelist
      .mockResolvedValueOnce({ success: false, error: 'Limit zapytań', errorCode: 'RATE_LIMIT' })
      .mockResolvedValueOnce({ ...OK, nip: '7740001454' });
    const out = await runNightlyValidationRecheck(ctx);
    expect(state.contractorUpdates.map((u) => u.id)).toEqual(['k-ok']);
    expect(out).toMatchObject({ processed: 2, validated: 1 });
  });

  it('walidacja zbiorcza (przycisk w UI): tak samo', async () => {
    state.contractors = [
      { id: 'k-awaria', nip: NIP },
      { id: 'k-ok', nip: '7740001454' },
    ];
    state.whitelist
      .mockResolvedValueOnce({ success: false, error: 'Biała Lista nie odpowiada', errorCode: 'TIMEOUT' })
      .mockResolvedValueOnce({ ...OK, nip: '7740001454' });
    await runBulkValidateContractors({ tenantId: 't1', contractorIds: ['k-awaria', 'k-ok'], forceRefresh: true, triggeredBy: 'u1' }, ctx);
    expect(state.contractorUpdates.map((u) => u.id)).toEqual(['k-ok']);
  });
});
