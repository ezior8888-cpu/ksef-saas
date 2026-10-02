import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ręczne „Sprawdź status VAT” kontrahenta: przy awarii Białej Listy / VIES
 * akcja nie może nadpisać ostatniego dobrego statusu i rachunków (do
 * 01.10.2026 zapisywała „nieznany” i pustą listę rachunków).
 */

const state = vi.hoisted(() => ({
  validate: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/validation/cache', () => ({ validateNipCached: state.validate, validateMultipleNips: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: vi.fn() }));
// Akcja wchodzi przez requireUserAndActiveOrg (AUD-58) — tu firma t1 po MFA.
vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: async () => ({
    user: { id: 'u1' },
    tenantId: 't1',
    role: 'owner',
    supabase: {
      from: () => {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q,
          eq: () => q,
          single: async () => ({ data: { id: 'k1', nip: '5260001246', tenant_id: 't1' }, error: null }),
          update: (patch: Record<string, unknown>) => { state.updates.push(patch); return q; },
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
        });
        return q;
      },
    },
  }),
}));

import { getContractorVatStatusAction } from '@/app/actions/validation';

beforeEach(() => {
  state.validate.mockReset();
  state.updates = [];
});

describe('ręczne sprawdzenie kontrahenta', () => {
  it('Biała Lista nie odpowiada — komunikat, status kontrahenta bez zmian', async () => {
    state.validate.mockResolvedValue({
      nip: '5260001246', countryCode: 'PL', isValid: false, vatStatus: 'unknown', bankAccounts: [],
      fromCache: false, source: 'whitelist', warning: 'Biała Lista nie odpowiada (timeout)', unavailable: true,
    });
    const r = await getContractorVatStatusAction('k1');
    expect(r).toMatchObject({ success: false });
    expect(!r.success && r.error).toContain('Biała Lista VAT chwilowo nie odpowiada');
    expect(state.updates).toHaveLength(0);
  });

  it('odpowiedź API — zapis jak dotąd', async () => {
    state.validate.mockResolvedValue({
      nip: '5260001246', countryCode: 'PL', isValid: true, vatStatus: 'active', bankAccounts: ['1'],
      fromCache: false, source: 'whitelist',
    });
    expect(await getContractorVatStatusAction('k1')).toMatchObject({ success: true });
    expect(state.updates).toEqual([expect.objectContaining({ vat_status: 'active', bank_accounts_validated: ['1'] })]);
  });
});
