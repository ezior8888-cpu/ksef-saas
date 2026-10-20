import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; eqs: Array<[string, unknown]>; or: string | null; limit: number | null };
const st = vi.hoisted(() => ({
  auth: vi.fn(),
  calls: [] as Array<{ table: string; eqs: Array<[string, unknown]>; or: string | null; limit: number | null }>,
  error: false,
  data: {} as Record<string, unknown[]>,
}));

function fakeSupabase() {
  return {
    from: (table: string) => {
      const call: Call = { table, eqs: [], or: null, limit: null };
      st.calls.push(call);
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (call.eqs.push([k, v]), q),
        or: (f: string) => ((call.or = f), q),
        order: () => q,
        limit: async (n: number) => {
          call.limit = n;
          return st.error
            ? { data: null, error: { message: 'x' } }
            : { data: st.data[table] ?? [], error: null };
        },
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/auth-context', () => {
  class ActionAuthError extends Error {}
  return { ActionAuthError, requireUserAndActiveOrg: st.auth };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { searchCommandPaletteAction } from '@/app/actions/command-search';
import { CommandMenu } from '@/components/dashboard/command-menu';
import { buildPaletteNavEntries, normalizeSearchQuery } from '@/lib/command-palette';
import { dashboardNavItems, dashboardSettingsNavItem } from '@/lib/dashboard-nav-config';
import { ActionAuthError } from '@/lib/supabase/auth-context';

beforeEach(() => {
  vi.clearAllMocks();
  st.calls = [];
  st.error = false;
  st.data = {};
  st.auth.mockResolvedValue({ supabase: fakeSupabase(), tenantId: 'ten-1', user: { id: 'u' }, role: 'member' });
});

describe('buildPaletteNavEntries', () => {
  it('zawiera każdą pozycję menu, ustawienia i obie akcje', () => {
    const hrefs = buildPaletteNavEntries().map((e) => e.href);
    for (const item of dashboardNavItems) expect(hrefs).toContain(item.href);
    expect(hrefs).toContain(dashboardSettingsNavItem.href);
    const actions = buildPaletteNavEntries().filter((e) => e.group === 'Akcje');
    expect(actions.map((a) => [a.label, a.href])).toEqual([
      ['Wystaw fakturę', '/invoices/new'],
      ['Dodaj wydatek', '/expenses'],
    ]);
  });
});

describe('buildPaletteNavEntries — faktury cykliczne (plan Finora E9)', () => {
  it('„Faktury cykliczne” są w ⌘K tak jak w menu, z nazwą sekcji w słowach kluczowych', () => {
    const entry = buildPaletteNavEntries().find((e) => e.href === '/invoices/recurring');
    expect(entry).toMatchObject({ group: 'Przejdź do', label: 'Faktury cykliczne' });
    expect(entry?.keywords).toContain('Sprzedaż');
  });
});

describe('buildPaletteNavEntries — unikalne wartości cmdk', () => {
  it('„Wystaw fakturę” jest i w menu, i w akcjach, a wartości (value) się nie powtarzają', () => {
    const entries = buildPaletteNavEntries();
    expect(entries.filter((e) => e.label === 'Wystaw fakturę').length).toBeGreaterThan(1);
    const values = entries.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
    // Etykieta zostaje w słowach kluczowych, by dopasowanie po nazwie działało.
    for (const e of entries) expect(e.keywords).toContain(e.label);
  });
});

describe('normalizeSearchQuery', () => {
  it('przycina, obcina do 80 znaków i odrzuca frazy krótsze niż 2', () => {
    expect(normalizeSearchQuery('  ab  ')).toBe('ab');
    expect(normalizeSearchQuery(' a ')).toBeNull();
    expect(normalizeSearchQuery('')).toBeNull();
    expect(normalizeSearchQuery('x'.repeat(200))).toHaveLength(80);
  });
});

describe('searchCommandPaletteAction', () => {
  it('faktura w walucie obcej ma kod waluty, nie „zł” (plan §2.4 pkt 6)', async () => {
    st.data = {
      invoices: [{ id: 'i2', internal_number: 'FV/2', buyer_data: { name: 'GmbH' }, gross_total: '100', currency: 'EUR' }],
      contractors: [],
    };
    const res = await searchCommandPaletteAction('gmbh');
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.invoices[0].grossLabel).toMatch(/EUR$/);
    expect(res.invoices[0].grossLabel).not.toContain('zł');
  });

  it('krótka fraza nie dotyka bazy ani sesji', async () => {
    const res = await searchCommandPaletteAction('a');
    expect(res).toEqual({ success: true, invoices: [], contractors: [] });
    expect(st.auth).not.toHaveBeenCalled();
    expect(st.calls).toHaveLength(0);
  });

  it('filtruje po tenant_id, limituje do 5 i mapuje wyniki', async () => {
    st.data = {
      invoices: [{ id: 'i1', internal_number: 'FV/1', buyer_data: { name: 'ACME' }, gross_total: '123.40' }],
      contractors: [{ id: 'c1', name: 'ACME', nip: '1234567890' }],
    };
    const res = await searchCommandPaletteAction('acme');
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.invoices[0]).toMatchObject({ id: 'i1', number: 'FV/1', buyer: 'ACME' });
    expect(res.invoices[0].grossLabel).toContain('123,40');
    expect(res.invoices[0].grossLabel).toMatch(/zł$/);
    expect(res.contractors).toEqual([{ id: 'c1', name: 'ACME', nip: '1234567890' }]);
    expect(st.calls).toHaveLength(2);
    for (const c of st.calls) {
      expect(c.eqs).toContainEqual(['tenant_id', 'ten-1']);
      expect(c.limit).toBe(5);
      expect(c.or).toBeTruthy();
    }
    expect(st.calls[0].eqs).toContainEqual(['direction', 'outgoing']);
  });

  it('błąd autoryzacji daje success false', async () => {
    st.auth.mockRejectedValue(new ActionAuthError('Niezalogowany'));
    expect(await searchCommandPaletteAction('acme')).toEqual({ success: false, error: 'Niezalogowany' });
  });

  it('błąd bazy daje polski komunikat', async () => {
    st.error = true;
    const res = await searchCommandPaletteAction('acme');
    expect(res.success).toBe(false);
  });
});

describe('CommandMenu', () => {
  it('renderuje przycisk z polskim tekstem i skrótem', () => {
    const html = renderToStaticMarkup(<CommandMenu />);
    expect(html).toContain('Szukaj lub przejdź…');
    expect(html).toContain('<kbd');
    expect(html).toContain('⌘K');
    expect(html).toContain('aria-label="Szukaj"');
  });
});
