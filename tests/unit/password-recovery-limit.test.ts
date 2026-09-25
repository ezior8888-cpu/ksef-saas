import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/cache/redis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/cache/redis')>();
  return { ...original, getRedis: mocks.client };
});
import { claimPasswordRecoverySession, checkPasswordRecoveryRequestRateLimit } from '@/lib/rate-limit/password';
const session = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://redis.example.test:8080');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-token');
  mocks.client.mockReturnValue({ eval: mocks.eval });
  mocks.eval.mockResolvedValue([1, 1, 1000]);
});
afterEach(() => vi.unstubAllEnvs());
it('uses separate atomic hashed IP and email budgets, without raw identities', async () => {
  expect((await checkPasswordRecoveryRequestRateLimit('fixture@example.test', '192.0.2.1')).allowed).toBe(true);
  expect(mocks.eval.mock.calls.map((call) => call[2])).toEqual([[10, 3600000], [5, 3600000]]);
  expect(mocks.eval.mock.calls[0][1][0]).toMatch(/^rl:password:resetIp:/);
  expect(mocks.eval.mock.calls[1][1][0]).toMatch(/^rl:password:resetEmail:/);
  expect(JSON.stringify(mocks.eval.mock.calls)).not.toContain('fixture@example.test');
  expect(JSON.stringify(mocks.eval.mock.calls)).not.toContain('192.0.2.1');
});
it('an exhausted IP cannot keep consuming an email budget', async () => {
  mocks.eval.mockResolvedValue([0, 10, 5000]);
  expect(await checkPasswordRecoveryRequestRateLimit('fixture@example.test', '192.0.2.1')).toEqual({ allowed: false, unavailable: false, retryAfter: 5 });
  expect(mocks.eval).toHaveBeenCalledTimes(1);
});
it('enforces per-email denial even when the IP remains allowed', async () => {
  mocks.eval.mockResolvedValueOnce([1, 1, 3600000]).mockResolvedValueOnce([0, 5, 1001]);
  expect(await checkPasswordRecoveryRequestRateLimit('fixture@example.test', '192.0.2.1')).toEqual({ allowed: false, unavailable: false, retryAfter: 2 });
});
it('claims exactly once with a window longer than the complete proof lifetime', async () => {
  mocks.eval.mockResolvedValueOnce([1, 1, 960000]).mockResolvedValueOnce([0, 1, 959999]);
  expect((await claimPasswordRecoverySession(session)).allowed).toBe(true);
  expect((await claimPasswordRecoverySession(session)).allowed).toBe(false);
  expect(mocks.eval.mock.calls[0][2]).toEqual([1, 960000]);
  expect(mocks.eval.mock.calls[0][1][0]).toMatch(/^rl:password:recoveryUse:/);
  expect(JSON.stringify(mocks.eval.mock.calls)).not.toContain(session);
});
it.each([null, [1, 1, 960001], [1, 2, 10], [1, 1, -1], [0, 0, 10], ['1', 1, 10]])('fails closed for malformed recovery claim replies %#', async (reply) => {
  mocks.eval.mockResolvedValue(reply);
  expect(await claimPasswordRecoverySession(session)).toEqual({ allowed: false, unavailable: true, retryAfter: 960 });
});
it('denies unconfigured Redis, thrown calls and malformed session identity', async () => {
  expect((await claimPasswordRecoverySession('bad')).unavailable).toBe(true);
  expect(mocks.client).not.toHaveBeenCalled();
  mocks.eval.mockRejectedValue(new Error('private detail'));
  expect((await claimPasswordRecoverySession(session)).unavailable).toBe(true);
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  expect((await claimPasswordRecoverySession(session)).unavailable).toBe(true);
  expect((await checkPasswordRecoveryRequestRateLimit('fixture@example.test', '192.0.2.1')).unavailable).toBe(true);
});
