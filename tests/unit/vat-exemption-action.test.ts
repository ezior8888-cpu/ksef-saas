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
        maybeSingle: async () => ({ data: { vat_exemption_basis: mocks.before }, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (patch) mocks.updates.push(patch);
          return Promise.resolve({ error: mocks.updateError }).then(ok);
        },
      });
      return q;
    },
  }),
}));

import { updateVatExemptionAction } from '@/app/actions/vat-exemption';
import { ActionAuthError } from '@/lib/supabase/auth-context';

/**
 * Zmiana statusu VAT firmy zmienia treść każdej kolejnej faktury w KSeF —
 * tylko właściciel/administrator, z wpisem do dziennika audytu.
 */

const CTX = { tenantId: 'ten-1', user: { id: 'u-1' }, role: 'owner' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.before = null;
  mocks.updateError = null;
  mocks.requireOrgRole.mockResolvedValue(CTX);
});

describe('ustawienie zwolnienia z VAT', () => {
  it('tylko właściciel i administrator — reszta bez zapisu', async () => {
    mocks.requireOrgRole.mockRejectedValue(new ActionAuthError('Brak uprawnień'));
    await expect(updateVatExemptionAction('art. 113 ust. 1 ustawy o VAT')).resolves.toEqual({
      success: false,
      error: 'Brak uprawnień',
    });
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(['owner', 'admin']);
    expect(mocks.updates).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('zapis podstawy + wpis do audytu „z → na”', async () => {
    await expect(updateVatExemptionAction('  art. 113 ust. 1 ustawy o VAT ')).resolves.toEqual({
      success: true,
      basis: 'art. 113 ust. 1 ustawy o VAT',
    });
    expect(mocks.updates).toEqual([{ vat_exemption_basis: 'art. 113 ust. 1 ustawy o VAT' }]);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.updated',
        tenantId: 'ten-1',
        userId: 'u-1',
        metadata: { field: 'vat_exemption_basis', from: null, to: 'art. 113 ust. 1 ustawy o VAT' },
      }),
    );
  });

  it('pusta podstawa = powrót do czynnego podatnika VAT', async () => {
    mocks.before = 'art. 113 ust. 1 ustawy o VAT';
    await expect(updateVatExemptionAction('')).resolves.toEqual({ success: true, basis: null });
    expect(mocks.updates).toEqual([{ vat_exemption_basis: null }]);
    // Audyt pamięta, z czego zmieniono — inaczej nie odtworzymy, od kiedy
    // faktury szły bez P_19A.
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { field: 'vat_exemption_basis', from: 'art. 113 ust. 1 ustawy o VAT', to: null },
      }),
    );
  });

  it('śmieci odrzucone przed zapisem', async () => {
    const result = await updateVatExemptionAction('ab');
    expect(result.success).toBe(false);
    expect(mocks.updates).toEqual([]);
  });

  it('przed migracją 00091: czytelny komunikat, bez wpisu do audytu', async () => {
    mocks.updateError = { code: '42703', message: 'column does not exist' };
    const result = await updateVatExemptionAction('art. 113 ust. 1 ustawy o VAT');
    expect(result).toMatchObject({ success: false });
    expect(result.success === false && result.error).toContain('aktualizację bazy');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
