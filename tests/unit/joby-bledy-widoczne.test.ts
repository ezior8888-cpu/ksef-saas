import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  candidates: [] as Row[],
  settings: [] as Row[],
  settingsError: null as { message: string } | null,
  contractors: [] as Row[],
  updateError: null as { message: string } | null,
  decide: vi.fn(),
  validate: vi.fn(),
  proposal: vi.fn(),
}));

vi.mock('@/lib/reminders/scheduler', () => ({
  findInvoicesRequiringReminders: async () => mocks.candidates,
  decideNextReminder: mocks.decide,
}));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: mocks.proposal }));
vi.mock('@/lib/flo/fingerprint', () => ({
  computeFingerprint: async () => ({ state: { facts: { grossTotal: 100, paidAmount: 0 }, context: {} } }),
}));
vi.mock('@/lib/validation/cache', () => ({ validateNipCached: mocks.validate }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: 0, error: null }),
    from(table: string) {
      let op: 'select' | 'update' = 'select';
      const predicates: Array<(r: Row) => boolean> = [];
      const q = {
        select: () => q,
        update() { op = 'update'; return q; },
        eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return q; },
        in(k: string, v: unknown[]) { predicates.push((r) => v.includes(r[k])); return q; },
        not: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        then(ok: (v: unknown) => unknown) {
          if (table === 'reminder_settings') {
            return Promise.resolve(
              mocks.settingsError
                ? { data: null, error: mocks.settingsError }
                : { data: mocks.settings.filter((r) => predicates.every((p) => p(r))), error: null },
            ).then(ok);
          }
          if (table === 'contractors' && op === 'update') {
            return Promise.resolve({ data: null, error: mocks.updateError }).then(ok);
          }
          if (table === 'contractors') return Promise.resolve({ data: mocks.contractors, error: null }).then(ok);
          return Promise.resolve({ data: [], error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));

import { runNightlyValidationRecheck } from '@/lib/jobs/runners/nightly-validation-recheck';
import { runReminderScheduler } from '@/lib/jobs/runners/reminder-scheduler';

/**
 * AUD-89: scheduler ponagleń łapał błąd każdej faktury i tylko go liczył
 * (bez śladu w logach), a dla każdej z setek faktur pytał bazę o ustawienia
 * firmy — także firm, które ponaglenia mają wyłączone. Nocna re-walidacja
 * kontrahentów miała pusty `catch` i liczyła nieudany zapis jako sukces.
 */

function ctx(): JobContext {
  return {
    attempt: 0,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
  };
}

const invoice = (id: string, tenant: string): Row => ({
  id, tenant_id: tenant, internal_number: id, payment_due_date: '2026-09-01',
  gross_total: 100, paid_amount: 0, buyer_data: null, buyer_nip: null, reminders_paused: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.candidates = [];
  mocks.settings = [];
  mocks.settingsError = null;
  mocks.contractors = [];
  mocks.updateError = null;
  mocks.decide.mockResolvedValue({ shouldSend: false, skipReason: 'test' });
  mocks.proposal.mockResolvedValue({ status: 'created' });
});

describe('scheduler ponagleń', () => {
  it('faktury firm z wyłączonym Wkurzaczem odpadają jednym zapytaniem, bez decyzji per faktura', async () => {
    mocks.candidates = [invoice('a1', 'A'), invoice('b1', 'B'), invoice('b2', 'B'), invoice('c1', 'C')];
    mocks.settings = [{ tenant_id: 'A', enabled: true }, { tenant_id: 'B', enabled: false }];

    const out = await runReminderScheduler(ctx());

    expect(mocks.decide.mock.calls.map((c) => (c[0] as Row).id)).toEqual(['a1']);
    expect(out).toMatchObject({ processed: 4 });
  });

  it('błąd jednej faktury trafia do logów z identyfikatorem, reszta idzie dalej', async () => {
    mocks.candidates = [invoice('a1', 'A'), invoice('a2', 'A')];
    mocks.settings = [{ tenant_id: 'A', enabled: true }];
    mocks.decide.mockRejectedValueOnce(new Error('timeout bazy'));
    const c = ctx();

    const out = await runReminderScheduler(c);

    expect(mocks.decide).toHaveBeenCalledTimes(2);
    expect(c.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ponaglenia'),
      expect.objectContaining({ invoiceId: 'a1', error: 'timeout bazy' }),
    );
    expect(out).toMatchObject({ errors: 1 });
  });

  it('błąd odczytu ustawień przerywa przebieg, zamiast udawać „wszyscy wyłączeni”', async () => {
    mocks.candidates = [invoice('a1', 'A')];
    mocks.settingsError = { message: 'permission denied' };

    await expect(runReminderScheduler(ctx())).rejects.toThrow(/permission denied/);
  });
});

describe('nocna re-walidacja kontrahentów', () => {
  const kontrahent = (id: string): Row => ({ id, nip: '1234567890', tenant_id: 'A', vat_status: 'active' });

  it('wyjątek przy kontrahencie — w logach i w liczniku, nie w pustym catch', async () => {
    mocks.contractors = [kontrahent('k1'), kontrahent('k2')];
    mocks.validate
      .mockRejectedValueOnce(new Error('VIES niedostępny'))
      .mockResolvedValueOnce({ vatStatus: 'active', checkedAt: '2026-10-02T04:00:00Z', source: 'whitelist' });
    const c = ctx();

    const out = await runNightlyValidationRecheck(c);

    expect(c.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('kontrahent'),
      expect.objectContaining({ contractorId: 'k1', error: 'VIES niedostępny' }),
    );
    expect(out).toMatchObject({ failed: 1 });
  });

  it('nieudany zapis do bazy to porażka, nie „zwalidowany”', async () => {
    mocks.contractors = [kontrahent('k1')];
    mocks.validate.mockResolvedValue({ vatStatus: 'active', checkedAt: '2026-10-02T04:00:00Z', source: 'whitelist' });
    mocks.updateError = { message: 'deadlock' };

    const out = await runNightlyValidationRecheck(ctx());

    expect(out).toMatchObject({ validated: 0, failed: 1 });
  });
});
