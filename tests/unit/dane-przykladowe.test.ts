import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Poprawka Bartosza 21.10.2026: przed weryfikacją KSeF Analizy i KPiR pokazują
 * dane przykładowe (pełna okazałość aplikacji), po weryfikacji — prawdziwe.
 */

const state = vi.hoisted(() => ({ verified: true as boolean | Error }));
vi.mock('@/lib/dashboard-shell-data', () => ({
  getDashboardActiveOrgVerified: async () => {
    if (state.verified instanceof Error) throw state.verified;
    return state.verified;
  },
}));

const { analizyKontekst, czyZweryfikowana } = await import('@/lib/demo/kontekst-przykladowy');
const { DEMO_TENANT } = await import('@/lib/demo/analizy-przykladowe');
const { kpirPrzykladowe } = await import('@/lib/demo/kpir-przykladowe');

const real = { supabase: {} as never, tenantId: 'firma-a' };

beforeEach(() => {
  state.verified = true;
});

describe('analizyKontekst', () => {
  it('zweryfikowana firma: prawdziwy klient i firma, bez plakietki', async () => {
    const ctx = await analizyKontekst(real, new Date('2026-10-21T10:00:00Z'));
    expect(ctx).toEqual({ ...real, demo: false });
  });

  it('przed weryfikacją: atrapa z danymi przykładowymi, firma-atrapa, plakietka', async () => {
    state.verified = false;
    const ctx = await analizyKontekst(real, new Date('2026-10-21T10:00:00Z'));
    expect(ctx.demo).toBe(true);
    expect(ctx.tenantId).toBe(DEMO_TENANT);
    expect(ctx.supabase).not.toBe(real.supabase);
    const { data } = await ctx.supabase.from('invoices').select('id').eq('tenant_id', DEMO_TENANT);
    expect((data ?? []).length).toBeGreaterThan(5);
  });

  it('błąd odczytu weryfikacji: zostajemy przy prawdziwych danych', async () => {
    state.verified = new Error('poza żądaniem');
    expect(await czyZweryfikowana()).toBe(true);
    expect((await analizyKontekst(real, new Date())).demo).toBe(false);
  });
});

describe('kpirPrzykladowe', () => {
  it('wpisy w wybranym miesiącu, sprzedaż z końca poprzedniego (także na przełomie roku)', () => {
    const { expenses, invoices } = kpirPrzykladowe(1, 2027);
    expect(expenses.every((e) => e.issue_date.startsWith('2027-01-'))).toBe(true);
    expect(invoices.every((i) => i.issue_date!.startsWith('2027-01-'))).toBe(true);
    expect(invoices.find((i) => i.id === 's0')?.sale_date).toBe('2026-12-29');
    expect(invoices.find((i) => i.id === 's1')?.internal_number).toBe('FV/01/2027/011');
  });

  it('luty: dzień przycięty do długości miesiąca', () => {
    const { invoices } = kpirPrzykladowe(3, 2026);
    expect(invoices.find((i) => i.id === 's0')?.sale_date).toBe('2026-02-28');
  });
});
