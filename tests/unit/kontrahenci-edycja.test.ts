import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-011 (audyt bloku 1): kontrahenci byli tylko pamięcią wyszukiwań w GUS —
 * bez edycji, usuwania i wyszukiwania; dane z GUS nie dawały się poprawić.
 */

type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ rows: [] as Row[], audit: vi.fn(), role: vi.fn() }));

function fakeSupabase() {
  return {
    from: () => {
      const filters: Array<[string, unknown]> = [];
      let op: 'select' | 'update' | 'delete' = 'select';
      let patch: Row = {};
      const hit = () => st.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      const run = () => {
        const rows = hit();
        if (op === 'update') rows.forEach((r) => Object.assign(r, patch));
        if (op === 'delete') st.rows = st.rows.filter((r) => !rows.includes(r));
        return { data: rows.map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: () => q,
        update: (p: Row) => { op = 'update'; patch = p; return q; },
        delete: () => { op = 'delete'; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: async () => ({ data: hit()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, fail),
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/auth-context', () => {
  class ActionAuthError extends Error {}
  return { ActionAuthError, requireOrgRole: st.role };
});
vi.mock('@/lib/audit/log', () => ({ logAudit: st.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteContractorAction, updateContractorAction } from '@/app/actions/contractors';
import { contractorSearchFilter } from '@/lib/contractors/edit';

const kontrahent = (o: Row = {}): Row => ({
  id: 'c-1', tenant_id: 'ten-1', nip: '5252241585', name: 'KLIENT SP Z O O',
  address: { countryCode: 'PL', addressLine1: 'UL. STARA 1', addressLine2: '00-001 WARSZAWA' },
  email: null, manual_fields: [], ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  st.rows = [kontrahent()];
  st.role.mockResolvedValue({ supabase: fakeSupabase(), tenantId: 'ten-1', user: { id: 'u-1' }, role: 'member' });
});

describe('edycja kontrahenta (F-011)', () => {
  it('zapisuje poprawkę i oznacza pola jako ręczne (nocne odświeżenie ich nie cofnie)', async () => {
    const r = await updateContractorAction('c-1', {
      name: 'Klient Sp. z o.o.', addressLine1: 'ul. Nowa 2', addressLine2: '00-002 Warszawa', email: 'faktury@klient.example',
    });
    expect(r).toEqual({ success: true });
    expect(st.rows[0]).toMatchObject({
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Nowa 2', addressLine2: '00-002 Warszawa' },
      email: 'faktury@klient.example',
      nip: '5252241585',
    });
    expect(st.rows[0]!.manual_fields).toEqual(['name', 'address', 'email']);
    expect(st.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'contractor.updated', entityId: 'c-1' }));
  });

  it('kontrahent innej organizacji — odmowa', async () => {
    st.rows = [kontrahent({ tenant_id: 'ten-2' })];
    const r = await updateContractorAction('c-1', { name: 'X', addressLine1: '', addressLine2: '', email: '' });
    expect(r.success).toBe(false);
    expect(st.rows[0]!.name).toBe('KLIENT SP Z O O');
  });

  it('błędne dane (pusta nazwa, zły e-mail) — odmowa bez zapisu', async () => {
    expect((await updateContractorAction('c-1', { name: ' ', addressLine1: '', addressLine2: '', email: '' })).success).toBe(false);
    expect((await updateContractorAction('c-1', { name: 'A', addressLine1: '', addressLine2: '', email: 'nie-mail' })).success).toBe(false);
    expect(st.audit).not.toHaveBeenCalled();
  });

  it('rola bez uprawnień — odmowa', async () => {
    const { ActionAuthError } = await import('@/lib/supabase/auth-context');
    st.role.mockRejectedValue(new ActionAuthError('Niewystarczające uprawnienia'));
    const r = await updateContractorAction('c-1', { name: 'A', addressLine1: '', addressLine2: '', email: '' });
    expect(r).toEqual({ success: false, error: 'Niewystarczające uprawnienia' });
    expect(st.role).toHaveBeenCalledWith(['owner', 'admin', 'member']);
  });
});

describe('usunięcie kontrahenta (F-011)', () => {
  it('usuwa i zapisuje audyt', async () => {
    expect(await deleteContractorAction('c-1')).toEqual({ success: true });
    expect(st.rows).toHaveLength(0);
    expect(st.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'contractor.deleted' }));
  });

  it('kontrahent innej organizacji zostaje', async () => {
    st.rows = [kontrahent({ tenant_id: 'ten-2' })];
    expect((await deleteContractorAction('c-1')).success).toBe(false);
    expect(st.rows).toHaveLength(1);
  });
});

describe('wyszukiwanie kontrahentów (F-011)', () => {
  it('nazwa', () => {
    expect(contractorSearchFilter('Kowal')).toBe('name.ilike.%Kowal%');
  });

  it('cyfry — także NIP (bez kresek)', () => {
    expect(contractorSearchFilter('525-224')).toBe('name.ilike.%525-224%,nip.ilike.%525224%');
  });

  it('znaki składni filtra usunięte', () => {
    expect(contractorSearchFilter('a,(b)')).toBe('name.ilike.%a b%');
    expect(contractorSearchFilter('  ')).toBeNull();
  });
});
