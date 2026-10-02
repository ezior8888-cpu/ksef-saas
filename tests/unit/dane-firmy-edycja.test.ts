import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-008 (audyt bloku 1): dane firmy (nazwa, adres siedziby) były tylko do
 * odczytu — błędny albo nieaktualny adres z GUS trafiał na każdą fakturę
 * bez możliwości poprawki. Właściciel i administrator mogą je teraz zmienić;
 * NIP zostaje bez zmian (tożsamość firmy w KSeF).
 */

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  audit: vi.fn(),
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  current: { name: 'Stara Nazwa', nip: '5260001246', address_json: { countryCode: 'PL', addressLine1: 'ul. Stara 1', addressLine2: '00-001 Warszawa' } } as Record<string, unknown>,
}));

vi.mock('@/lib/supabase/auth-context', () => {
  class ActionAuthError extends Error {}
  return { ActionAuthError, requireOrgRole: mocks.role };
});
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: async () => ({ data: mocks.current, error: null }),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
          if (patch) mocks.updates.push({ patch, filters });
          return Promise.resolve({ data: null, error: null }).then(ok, fail);
        },
      };
      return q;
    },
  }),
}));

import { updateCompanyProfileAction } from '@/app/actions/company-profile';
import { companyProfileSchema } from '@/lib/schemas/company-profile';

const valid = { name: 'Nowa Nazwa Sp. z o.o.', addressLine1: 'ul. Nowa 5/2', addressLine2: '02-001 Warszawa' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.role.mockResolvedValue({ tenantId: 'ten-1', user: { id: 'user-1' }, role: 'owner' });
});

describe('schemat danych firmy', () => {
  it('poprawne dane', () => {
    expect(companyProfileSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['pusta nazwa', { ...valid, name: '  ' }],
    ['brak kodu pocztowego w drugiej linii', { ...valid, addressLine2: 'Warszawa' }],
    ['znak sterujący w nazwie', { ...valid, name: 'Firma\u000B' }],
    ['za długi adres', { ...valid, addressLine1: 'x'.repeat(513) }],
  ])('%s — odrzucone', (_label, v) => {
    expect(companyProfileSchema.safeParse(v).success).toBe(false);
  });
});

describe('updateCompanyProfileAction (F-008)', () => {
  it('właściciel zapisuje nazwę i adres; NIP nie jest zmieniany; audyt', async () => {
    const r = await updateCompanyProfileAction({ ...valid, nip: '1111111111' } as typeof valid);
    expect(r).toEqual({ success: true });
    expect(mocks.role).toHaveBeenCalledWith(['owner', 'admin']);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.patch).toEqual({
      name: 'Nowa Nazwa Sp. z o.o.',
      address_json: { countryCode: 'PL', addressLine1: 'ul. Nowa 5/2', addressLine2: '02-001 Warszawa' },
    });
    expect(mocks.updates[0]!.filters).toEqual([['id', 'ten-1']]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'tenant.updated', tenantId: 'ten-1' }));
  });

  it('rola bez uprawnień — odmowa bez zapisu', async () => {
    const { ActionAuthError } = await import('@/lib/supabase/auth-context');
    mocks.role.mockRejectedValue(new ActionAuthError('Niewystarczające uprawnienia'));
    const r = await updateCompanyProfileAction(valid);
    expect(r).toEqual({ success: false, error: 'Niewystarczające uprawnienia' });
    expect(mocks.updates).toHaveLength(0);
  });

  it('błędne dane — odmowa bez zapisu', async () => {
    const r = await updateCompanyProfileAction({ ...valid, addressLine2: 'bez kodu' });
    expect(r.success).toBe(false);
    expect(mocks.updates).toHaveLength(0);
  });
});
