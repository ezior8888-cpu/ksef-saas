import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  audit: vi.fn(),
  updates: [] as unknown[],
  before: false,
  updateError: null as { code?: string; message: string } | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/supabase/auth-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase/auth-context')>()),
  requireOrgRole: mocks.requireOrgRole,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let patch: unknown = null;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        update: (p: unknown) => ((patch = p), q),
        eq: () => q,
        maybeSingle: async () => ({ data: { vat_cash_method: mocks.before }, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (patch) mocks.updates.push(patch);
          return Promise.resolve({ error: mocks.updateError }).then(ok);
        },
      });
      return q;
    },
  }),
}));

import { updateCashMethodAction } from '@/app/actions/cash-method';
import { ActionAuthError } from '@/lib/supabase/auth-context';

/** Metoda kasowa zmienia każdą kolejną fakturę — owner/admin, z audytem. */

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.before = false;
  mocks.updateError = null;
  mocks.requireOrgRole.mockResolvedValue({ tenantId: 'ten-1', user: { id: 'u-1' }, role: 'owner' });
});

describe('ustawienie metody kasowej', () => {
  it('tylko właściciel i administrator — reszta bez zapisu', async () => {
    mocks.requireOrgRole.mockRejectedValue(new ActionAuthError('Brak uprawnień'));
    await expect(updateCashMethodAction(true)).resolves.toEqual({ success: false, error: 'Brak uprawnień' });
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(['owner', 'admin']);
    expect(mocks.updates).toEqual([]);
  });

  it('włączenie: zapis + audyt „z → na”', async () => {
    await expect(updateCashMethodAction(true)).resolves.toEqual({ success: true, enabled: true });
    expect(mocks.updates).toEqual([{ vat_cash_method: true }]);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { field: 'vat_cash_method', from: false, to: true } }),
    );
  });

  it('wyłączenie pamięta stan „z”', async () => {
    mocks.before = true;
    await updateCashMethodAction(false);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { field: 'vat_cash_method', from: true, to: false } }),
    );
  });

  it('nie-boolean (wywołanie z pominięciem UI) — odmowa bez zapisu', async () => {
    const result = await updateCashMethodAction('tak' as unknown as boolean);
    expect(result.success).toBe(false);
    expect(mocks.updates).toEqual([]);
  });

  it('przed migracją 00094: czytelny komunikat, bez audytu', async () => {
    mocks.updateError = { code: '42703', message: 'column does not exist' };
    const result = await updateCashMethodAction(true);
    expect(result.success === false && result.error).toContain('aktualizację bazy');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
