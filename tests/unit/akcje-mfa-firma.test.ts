import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const s = vi.hoisted(() => ({
  mfa: 'verified' as 'verified' | 'enrollment_required' | 'challenge_required' | 'unauthenticated',
  membership: { role: 'owner', status: 'active' } as Row | null,
  cookieOrg: '11111111-1111-4111-8111-111111111111',
  accessRow: { tenant_id: '11111111-1111-4111-8111-111111111111' } as Row | null,
  validate: vi.fn(),
  bank: vi.fn(),
  sendJob: vi.fn(),
  updates: [] as Array<{ table: string; patch: Row }>,
  conversationUpdates: [] as Row[],
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: s.cookieOrg }) }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/verified-mfa', () => ({
  getVerifiedMfaState: async () =>
    s.mfa === 'unauthenticated' ? { status: 'unauthenticated' } : { status: s.mfa, user: { id: 'u-1', email: 'u@example.test' } },
}));
vi.mock('@/lib/validation/cache', () => ({ validateNipCached: s.validate }));
vi.mock('@/lib/validation/whitelist-client', () => ({ checkBankAccountInWhitelist: s.bank }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: s.sendJob }));
vi.mock('@/lib/alerts/slack', () => ({ sendSlackAlert: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/support/conversations', () => ({
  getOwnedConversation: async () => ({ id: 'c-1', status: 'open', category: 'faktury' }),
  updateConversation: async (_id: string, patch: Row) => {
    s.conversationUpdates.push(patch);
  },
}));

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: s.mfa === 'unauthenticated' ? null : { id: 'u-1' } } }) },
    from(table: string) {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        not: () => q,
        update: (patch: Row) => {
          s.updates.push({ table, patch });
          return q;
        },
        maybeSingle: async () => {
          if (table === 'memberships') return { data: s.membership, error: null };
          if (table === 'accountant_access') return { data: s.accessRow, error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: { id: 'k1', nip: '5260001246', tenant_id: s.cookieOrg }, error: null }),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(
            table === 'contractors'
              ? { data: [{ id: 'k1', nip: '5260001246' }], error: null }
              : { data: [{ id: 'a-1' }], error: null },
          ).then(ok),
      });
      return q;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => client(),
  createAdminClient: () => client(),
}));

import { revokeAccountantTokenAction } from '@/components/settings/accountant-actions';
import { escalateConversationAction, submitCsatAction } from '@/lib/support/support-actions';
import {
  bulkValidateContractorsAction,
  getContractorVatStatusAction,
  validateBankAccountAction,
  validateNipLiveAction,
} from '@/app/actions/validation';

/**
 * AUD-58: część akcji serwerowych sprawdzała tylko `getUser()`. Konto
 * z włączonym MFA przechodziło sesją bez drugiego kroku (AAL1), a akcje
 * na danych firmy brały firmę z ciasteczka bez sprawdzenia członkostwa.
 */

beforeEach(() => {
  s.mfa = 'verified';
  s.membership = { role: 'owner', status: 'active' };
  s.accessRow = { tenant_id: s.cookieOrg };
  s.validate.mockReset().mockResolvedValue({ vatStatus: 'active', source: 'whitelist', bankAccounts: [] });
  s.bank.mockReset().mockResolvedValue({ isOnWhitelist: true });
  s.sendJob.mockReset().mockResolvedValue({ ids: ['job-1'] });
  s.updates = [];
  s.conversationUpdates = [];
});

describe('sesja bez drugiego kroku MFA nie przechodzi', () => {
  beforeEach(() => {
    s.mfa = 'challenge_required';
  });

  it.each([
    ['walidacja NIP', () => validateNipLiveAction('5260001246')],
    ['walidacja rachunku', () => validateBankAccountAction('5260001246', '12345678901234567890123456')],
    ['walidacja zbiorcza', () => bulkValidateContractorsAction()],
    ['status kontrahenta', () => getContractorVatStatusAction('k1')],
    ['cofnięcie dostępu księgowej', () => revokeAccountantTokenAction('a-1')],
  ])('%s', async (_opis, run) => {
    const out = (await run()) as { success: boolean; error?: string };
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/dwuetapowa/);
    expect(s.validate).not.toHaveBeenCalled();
    expect(s.bank).not.toHaveBeenCalled();
    expect(s.sendJob).not.toHaveBeenCalled();
    expect(s.updates).toEqual([]);
  });

  it('pomoc: ocena i eskalacja rozmowy', async () => {
    expect(await submitCsatAction('c-1', true)).toEqual({ ok: false });
    expect(await escalateConversationAction('c-1')).toEqual({ ok: false });
    expect(s.conversationUpdates).toEqual([]);
  });
});

describe('firma z ciasteczka bez członkostwa nie przechodzi', () => {
  beforeEach(() => {
    s.membership = null;
  });

  it('walidacja zbiorcza nie startuje joba dla cudzej firmy', async () => {
    const out = await bulkValidateContractorsAction();

    expect(out).toMatchObject({ success: false, error: 'Brak dostępu do aktywnej organizacji' });
    expect(s.sendJob).not.toHaveBeenCalled();
  });
});

describe('dostęp księgowej cofa tylko właściciel', () => {
  it('członek bez roli właściciela — odmowa', async () => {
    s.membership = { role: 'member', status: 'active' };

    const out = await revokeAccountantTokenAction('a-1');

    expect(out).toMatchObject({ success: false, error: 'Tylko właściciel' });
    expect(s.updates).toEqual([]);
  });

  it('właściciel po MFA — cofnięte', async () => {
    expect(await revokeAccountantTokenAction('a-1')).toEqual({ success: true });
  });
});

describe('bez MFA w koncie (opcjonalne) — działa jak dotąd', () => {
  it('walidacja NIP', async () => {
    s.mfa = 'enrollment_required';

    expect(await validateNipLiveAction('5260001246')).toMatchObject({ success: true });
  });
});

describe('usunięcie kosztu (AUD-58)', () => {
  it('sesja bez drugiego kroku MFA — odmowa, nic nie usunięte', async () => {
    s.mfa = 'challenge_required';
    const { deleteExpenseAction } = await import('@/app/actions/expenses');

    const out = await deleteExpenseAction('e-1');

    expect(out).toMatchObject({ success: false });
    expect(s.updates).toEqual([]);
  });
});
