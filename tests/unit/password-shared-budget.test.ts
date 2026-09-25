import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), isolatedClient: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), getSession: vi.fn(),
  password: vi.fn(), cleanup: vi.fn(), eval: vi.fn(), redis: vi.fn(), update: vi.fn(), send: vi.fn(),
  createRequest: vi.fn(), cancelRequest: vi.fn(), email: vi.fn(), audit: vi.fn(), unenroll: vi.fn(), removeCodes: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.isolatedClient }));
vi.mock('@/lib/cache/redis', async (original) => ({
  ...await original<typeof import('@/lib/cache/redis')>(), getRedis: mocks.redis,
}));
vi.mock('@/lib/auth/password', () => ({ validatePassword: async () => ({ valid: true }) }));
vi.mock('@/lib/auth/mfa-recovery', () => ({ deleteAllRecoveryCodes: mocks.removeCodes }));
vi.mock('@/lib/gdpr/deletion', () => ({ createGdprRequest: mocks.createRequest, cancelOwnGdprRequest: mocks.cancelRequest }));
vi.mock('@/lib/email/send', () => ({ sendGdprDeletionScheduledEmail: mocks.email }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ origin: 'https://app.example.test' }) }));
import { cancelOwnGdprDeletionAction, requestGdprDeletionAction } from '@/app/(dashboard)/settings/account/actions';
import { changePasswordAction, requestPasswordChangeNonceAction, unenrollTotpAction } from '@/app/(dashboard)/settings/security/actions';
import { reauthenticateWithPassword } from '@/lib/auth/reauth';

const account = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test',
  factors: [{ id: 'totp-fixture', factor_type: 'totp', status: 'verified' }] };
const password = 'Synthetic-current!123';
const form = () => { const data = new FormData(); data.set('current_password', password); data.set('new_password', 'Synthetic-next!456'); return data; };
const actions = [
  { name: 'request GDPR deletion', run: () => requestGdprDeletionAction(form()), invalid: 'invalid_password' },
  { name: 'cancel GDPR deletion', run: () => cancelOwnGdprDeletionAction(form()), invalid: 'invalid_password' },
  { name: 'change password', run: () => changePasswordAction(form()), invalid: 'invalid_current' },
  { name: 'disable TOTP', run: () => unenrollTotpAction(password), invalid: 'invalid_password' },
  { name: 'send password-change nonce', run: () => requestPasswordChangeNonceAction(form()), invalid: 'invalid_current' },
];
let counts: Map<string, number>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-redis-token');
  counts = new Map();
  mocks.redis.mockReturnValue({ eval: mocks.eval });
  // Transport fixture models an atomic response, not an integration test of Lua/Valkey.
  mocks.eval.mockImplementation(async (_script: string, keys: string[], args: number[]) => {
    const [limit, ttl] = args;
    const count = counts.get(keys[0]) ?? 0;
    if (count >= limit) return [0, count, ttl];
    counts.set(keys[0], count + 1);
    return [1, count + 1, ttl];
  });
  mocks.client.mockResolvedValue({ auth: {
    getUser: mocks.getUser, getClaims: mocks.getClaims, getSession: mocks.getSession,
    updateUser: mocks.update, reauthenticate: mocks.send,
    mfa: { unenroll: mocks.unenroll, listFactors: async () => ({ data: { all: account.factors }, error: null }) },
  } });
  mocks.getUser.mockResolvedValue({ data: { user: account }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'fixture-original-aal2' } }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: account.id, aal: 'aal2' } }, error: null });
  mocks.isolatedClient.mockReturnValue({ auth: { signInWithPassword: mocks.password, admin: { signOut: mocks.cleanup } } });
  mocks.password.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Synthetic invalid password' } });
  mocks.cleanup.mockResolvedValue({ error: null });
  mocks.cancelRequest.mockResolvedValue({ ok: true, requestId: 'fixture-request' });
  mocks.createRequest.mockResolvedValue({ id: 'fixture-request', alreadyScheduled: true, scheduledFor: new Date('2030-01-01'), cancelToken: null });
  mocks.update.mockResolvedValue({ data: { user: account }, error: null });
  mocks.send.mockResolvedValue({ error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
  mocks.removeCodes.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function expectNoEffects() {
  for (const mock of [mocks.createRequest, mocks.cancelRequest, mocks.update, mocks.send, mocks.unenroll, mocks.removeCodes, mocks.email, mocks.audit]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

describe('real account actions share the real reauth and password limiter', () => {
  it('charges one attempt per entry point, including GDPR, and blocks further direct or mixed attempts', async () => {
    for (const action of actions) expect(await action.run()).toEqual({ ok: false, error: action.invalid });
    expect(mocks.password).toHaveBeenCalledTimes(5);
    const attemptCalls = mocks.eval.mock.calls.filter((call) => call[1][0].startsWith('rl:password:attempt:'));
    expect(attemptCalls).toHaveLength(5);
    expect(new Set(attemptCalls.map((call) => call[1][0])).size).toBe(1);
    expect(await reauthenticateWithPassword(password)).toEqual({ ok: false, error: 'rate_limited', retryAfter: 300 });
    const more = await Promise.all(Array.from({ length: 12 }, (_, i) => actions[i % 4].run()));
    expect(more.every((result) => !result.ok && result.error === 'rate_limited')).toBe(true);
    expect(mocks.password).toHaveBeenCalledTimes(5);
    expectNoEffects();
  });
  it('only five of twenty simultaneous mixed attempts reach Auth', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => actions[i % 4].run()));
    expect(results.filter((result) => !result.ok && result.error === 'rate_limited')).toHaveLength(15);
    expect(mocks.password).toHaveBeenCalledTimes(5);
    expect(mocks.eval).toHaveBeenCalledTimes(20);
    expectNoEffects();
  });
  it.each(actions)('stops $name before checking a password when Redis fails', async ({ run }) => {
    mocks.eval.mockRejectedValue(new Error('synthetic-private-transport-detail'));
    expect(await run()).toEqual({ ok: false, error: 'verification_unavailable' });
    expect(mocks.isolatedClient).not.toHaveBeenCalled();
    expect(mocks.password).not.toHaveBeenCalled();
    expectNoEffects();
  });
  it.each(actions)('charges exactly once for a successful $name', async ({ run }) => {
    mocks.password.mockResolvedValue({ data: { user: account, session: { access_token: 'fixture-temporary' } }, error: null });
    expect(await run()).toMatchObject({ ok: true });
    expect(mocks.password).toHaveBeenCalledTimes(1);
    expect(mocks.eval.mock.calls.filter((call) => call[1][0].startsWith('rl:password:attempt:'))).toHaveLength(1);
    expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith('fixture-temporary', 'local');
  });
});
