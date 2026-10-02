import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

const s = vi.hoisted(() => ({
  mfa: 'verified' as 'verified' | 'challenge_required' | 'enrollment_required',
  cookieOrg: '11111111-1111-4111-8111-111111111111',
  memberOf: new Set<string>(['11111111-1111-4111-8111-111111111111']),
  orgName: 'Firma',
  pendingInvites: 0,
  emails: [] as Row[],
  inserts: [] as Array<{ table: string; row: Row }>,
  memberUserIds: [] as string[],
  usersById: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: s.cookieOrg }), set: vi.fn() }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: async (m: Row) => { s.emails.push(m); return { sent: true }; } }));
vi.mock('@/lib/auth/verified-mfa', () => ({
  getVerifiedMfaState: async () => ({ status: s.mfa, user: { id: USER, email: 'owner@example.test' } }),
}));

function client() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } } }),
      admin: {
        getUserById: async (id: string) => ({ data: { user: s.usersById.has(id) ? { id, email: s.usersById.get(id) } : null }, error: null }),
        listUsers: async () => { throw new Error('listUsers nie powinno być wołane (AUD-125)'); },
      },
    },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        is: () => q,
        gt: () => q,
        update: () => q,
        upsert: (row: Row) => { s.inserts.push({ table, row }); return q; },
        insert: (row: Row) => { s.inserts.push({ table, row }); return q; },
        single: async () => ({ data: { id: 'inv-1' }, error: null }),
        maybeSingle: async () => {
          if (table === 'memberships') {
            const org = filters.find(([k]) => k === 'organization_id')?.[1] as string;
            return { data: s.memberOf.has(org) ? { role: 'owner', status: 'active', id: 'm-1' } : null, error: null };
          }
          if (table === 'tenants') return { data: { name: s.orgName }, error: null };
          return { data: null, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (table === 'memberships') return Promise.resolve({ data: s.memberUserIds.map((user_id) => ({ user_id })), error: null }).then(ok);
          if (table === 'organization_invitations') return Promise.resolve({ data: [], count: s.pendingInvites, error: null }).then(ok);
          return Promise.resolve({ data: null, error: null }).then(ok);
        },
      });
      return q;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client(), createAdminClient: () => client() }));

import { subscribePushAction } from '@/app/actions/push-subscriptions';
import { inviteMemberAction, setActiveOrganizationAction } from '@/app/actions/organizations';

beforeEach(() => {
  s.mfa = 'verified';
  s.cookieOrg = ORG;
  s.memberOf = new Set([ORG]);
  s.orgName = 'Firma';
  s.pendingInvites = 0;
  s.emails = [];
  s.inserts = [];
  s.memberUserIds = [];
  s.usersById = new Map();
});

describe('zaproszenia (AUD-32, AUD-125)', () => {
  it('nazwa firmy w mailu jest escapowana, temat bez znaków nowej linii', async () => {
    s.orgName = '<a href="https://zly.example">Bank</a>\r\nBcc: ofiara@example.test';

    const out = await inviteMemberAction({ email: 'nowy@example.test', role: 'member' });

    expect(out).toMatchObject({ success: true });
    const mail = s.emails[0]!;
    expect(String(mail.html)).not.toContain('<a href="https://zly.example">');
    expect(String(mail.html)).toContain('&lt;a href=');
    expect(String(mail.subject)).not.toMatch(/[\r\n]/);
  });

  it('limit aktywnych zaproszeń firmy', async () => {
    s.pendingInvites = 20;

    const out = await inviteMemberAction({ email: 'kolejny@example.test', role: 'member' });

    expect(out).toMatchObject({ success: false });
    expect((out as { error: string }).error).toMatch(/limit/i);
    expect(s.emails).toEqual([]);
  });

  it('członek firmy rozpoznany po identyfikatorze, nie z pierwszej strony kont', async () => {
    s.memberUserIds = ['u-500'];
    s.usersById.set('u-500', 'juz.jest@example.test');

    const out = await inviteMemberAction({ email: 'juz.jest@example.test', role: 'member' });

    expect(out).toMatchObject({ success: false, error: 'Ten użytkownik jest już członkiem' });
  });
});

// Poprawne klucze Web Push — inaczej odmowa przychodzi z walidacji klucza, nie z członkostwa.
const KEY_P256 = 'B'.repeat(87);
const KEY_AUTH = 'A'.repeat(22);

describe('sesja po MFA i członkostwo (AUD-58)', () => {
  it('subskrypcja push członka firmy — zapisana (kontrola zestawu)', async () => {
    const out = await subscribePushAction({ endpoint: 'https://fcm.googleapis.com/fcm/send/ok', p256dh: KEY_P256, auth: KEY_AUTH });

    expect(out).toMatchObject({ success: true });
    expect(s.inserts.filter((i) => i.table === 'push_subscriptions')).toHaveLength(1);
  });

  it('przełączenie firmy wymaga ukończonego drugiego kroku', async () => {
    s.mfa = 'challenge_required';

    const out = await setActiveOrganizationAction(ORG);

    expect(out).toMatchObject({ success: false, error: 'Wymagana weryfikacja dwuetapowa' });
  });

  it('subskrypcja push dla firmy z ciasteczka, w której nie jesteś członkiem — odmowa', async () => {
    s.cookieOrg = OTHER_ORG;

    const out = await subscribePushAction({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: KEY_P256, auth: KEY_AUTH });

    expect(out).toMatchObject({ success: false });
    expect(s.inserts.filter((i) => i.table === 'push_subscriptions')).toEqual([]);
  });
});
