import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-61: adres subskrypcji push szedł prosto od klienta do bazy, a serwer
 * wysyłał na niego żądania — dowolny adres, także w sieci wewnętrznej.
 * Akcja preferencji przepuszczała dowolne kolumny. Teraz: tylko HTTPS
 * do znanych usług push przeglądarek, klucze w formacie Web Push, a
 * w preferencjach wyłącznie pola `notify_*`.
 */

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), send: vi.fn(), rows: [] as Record<string, unknown>[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: async () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    from: () => {
      const q = {
        upsert: async (row: unknown) => { mocks.upsert(row); return { error: null }; },
        update: (patch: unknown) => { mocks.update(patch); return q; },
        eq: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q, eq: () => q, update: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: mocks.rows, error: null }).then(ok),
      };
      return q;
    },
  }),
}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mocks.send } }));

import { subscribePushAction, updatePushPreferencesAction } from '@/app/actions/push-subscriptions';
import { isAllowedPushEndpoint } from '@/lib/push/endpoint';

const KEYS = { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
});

describe('adres usługi push', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGabc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('przyjmuje %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost:5432/',
    'https://fcm.googleapis.com.evil.test/x',
    'https://evil.test/?fcm.googleapis.com',
    'nie-adres',
  ])('odrzuca %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('subskrypcja', () => {
  it('odrzuca adres spoza usług push bez zapisu', async () => {
    const r = await subscribePushAction({ endpoint: 'https://10.0.0.5/hook', ...KEYS });
    expect(r.success).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('odrzuca klucze w złym formacie', async () => {
    const r = await subscribePushAction({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'x', auth: 'y' });
    expect(r.success).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('przyjmuje poprawną subskrypcję', async () => {
    const r = await subscribePushAction({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...KEYS });
    expect(r.success).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
});

describe('preferencje', () => {
  it('zapisuje tylko pola notify_*', async () => {
    await updatePushPreferencesAction('sub-1', { notify_invoice_accepted: false, user_id: 'cudzy', endpoint: 'https://evil.test' } as never);
    expect(mocks.update).toHaveBeenCalledWith({ notify_invoice_accepted: false });
  });
});

describe('wysyłka', () => {
  it('pomija zapisany wcześniej adres spoza usług push', async () => {
    vi.stubEnv('VAPID_SUBJECT', 'mailto:pomoc@faktflow.pl');
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'fixture-public');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'fixture-private');
    mocks.rows = [
      { id: 's1', endpoint: 'https://10.0.0.5/hook', p256dh: KEYS.p256dh, auth: KEYS.auth },
      { id: 's2', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: KEYS.p256dh, auth: KEYS.auth },
    ];
    const { sendPushToUser } = await import('@/lib/push/sender');
    await sendPushToUser('fixture-user', 'invoice_accepted', { title: 't', body: 'b' });
    const targets = mocks.send.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint);
    expect(targets).toEqual(['https://fcm.googleapis.com/fcm/send/abc']);
    vi.unstubAllEnvs();
  });
});
