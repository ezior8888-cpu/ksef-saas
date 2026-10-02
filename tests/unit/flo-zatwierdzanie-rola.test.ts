import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-113: zatwierdzenie propozycji FLO uruchamia działanie na zewnątrz
 * w imieniu firmy (np. ponaglenie do kontrahenta). Wystarczało członkostwo —
 * zatwierdzić mógł też członek zespołu albo księgowa. Teraz tylko właściciel
 * i administrator; pozostali dostają odmowę, zanim cokolwiek zostanie odczytane.
 */

const mock = vi.hoisted(() => ({ role: 'member', admin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { mock.admin(); throw new Error('nie powinno dojść do bazy'); } }));
vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: async () => ({ tenantId: 'tenant-a', user: { id: 'user-a' }, role: mock.role }),
}));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false, getGlobalFlag: async () => false }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/flo/functions', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { approveProposal } from '@/app/actions/flo';

beforeEach(() => vi.clearAllMocks());

describe('kto zatwierdza działania FLO', () => {
  it.each(['member', 'accountant'])('%s — odmowa bez dostępu do bazy', async (role) => {
    mock.role = role;
    const result = await approveProposal('proposal-a', 'a'.repeat(64));
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(mock.admin).not.toHaveBeenCalled();
  });
});
