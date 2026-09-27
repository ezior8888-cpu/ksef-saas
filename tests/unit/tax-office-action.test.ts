import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  audit: vi.fn(),
  updates: [] as unknown[],
  before: null as string | null,
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
        update: (p: unknown) => {
          patch = p;
          return q;
        },
        eq: () => q,
        maybeSingle: async () => ({ data: { tax_office_code: mocks.before }, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (patch) mocks.updates.push(patch);
          return Promise.resolve({ error: mocks.updateError }).then(ok);
        },
      });
      return q;
    },
  }),
}));

import { updateTaxOfficeAction } from '@/app/actions/tax-office';
import { ActionAuthError } from '@/lib/supabase/auth-context';

/**
 * Urząd skarbowy trafia do nagłówka plików JPK składanych w imieniu firmy —
 * tylko właściciel/administrator, z wpisem do dziennika audytu.
 */

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.before = null;
  mocks.updateError = null;
  mocks.requireOrgRole.mockResolvedValue({ tenantId: 'ten-1', user: { id: 'u-1' }, role: 'owner' });
});

describe('ustawienie urzędu skarbowego', () => {
  it('tylko właściciel i administrator — reszta bez zapisu', async () => {
    mocks.requireOrgRole.mockRejectedValue(new ActionAuthError('Brak uprawnień'));
    await expect(updateTaxOfficeAction('1433')).resolves.toEqual({ success: false, error: 'Brak uprawnień' });
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(['owner', 'admin']);
    expect(mocks.updates).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('zmiana urzędu: zapis kodu + audyt „z → na”', async () => {
    mocks.before = '1408';
    await expect(updateTaxOfficeAction('1433 — URZĄD SKARBOWY WARSZAWA-MOKOTÓW')).resolves.toEqual({
      success: true,
      code: '1433',
    });
    expect(mocks.updates).toEqual([{ tax_office_code: '1433' }]);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.updated',
        tenantId: 'ten-1',
        userId: 'u-1',
        metadata: { field: 'tax_office_code', from: '1408', to: '1433' },
      }),
    );
  });

  it('pusty wybór zdejmuje urząd', async () => {
    mocks.before = '1433';
    await expect(updateTaxOfficeAction('')).resolves.toEqual({ success: true, code: null });
    expect(mocks.updates).toEqual([{ tax_office_code: null }]);
  });

  it('kod spoza słownika MF — odmowa bez zapisu', async () => {
    const result = await updateTaxOfficeAction('9999');
    expect(result.success).toBe(false);
    expect(mocks.updates).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('przed migracją 00092: czytelny komunikat, bez wpisu do audytu', async () => {
    mocks.updateError = { code: '42703', message: 'column does not exist' };
    const result = await updateTaxOfficeAction('1433');
    expect(result.success === false && result.error).toContain('aktualizację bazy');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
