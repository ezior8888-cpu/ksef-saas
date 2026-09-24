import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashIdentifier } from '@/lib/rate-limit';
import { checkPasswordOperationRateLimit, checkPasswordNonceSendRateLimit } from '@/lib/rate-limit/password';

const redis = vi.hoisted(() => ({ eval: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/cache/redis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/cache/redis')>();
  return { ...original, getRedis: redis.client };
});
const account = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://redis-bridge.example.test:8080');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-token');
  redis.client.mockReturnValue({ eval: redis.eval });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each([
  { name: 'attempt', check: checkPasswordOperationRateLimit, limit: 5, seconds: 300 },
  { name: 'send', check: checkPasswordNonceSendRateLimit, limit: 1, seconds: 60 },
])('password $name limiter', ({ name, check, limit, seconds }) => {
  it('uses one hashed key outside MFA and atomic EVAL with a bounded policy', async () => {
    redis.eval.mockResolvedValue([1, 1, seconds * 1000]);
    expect(await check(account)).toEqual({ allowed: true, retryAfter: 0, unavailable: false });
    expect(redis.eval).toHaveBeenCalledExactlyOnceWith(
      expect.any(String), [`rl:password:${name}:account:${hashIdentifier(account)}`], [limit, seconds * 1000],
    );
    expect(JSON.stringify(redis.eval.mock.calls)).not.toContain(account);
    expect(JSON.stringify(redis.eval.mock.calls)).not.toContain('rl:mfa:');
  });
  it('denies a full window and uses its remaining TTL without extending it', async () => {
    redis.eval.mockResolvedValueOnce([0, limit, 1001]).mockResolvedValueOnce([0, limit, 0]).mockResolvedValueOnce([1, 1, seconds * 1000]);
    expect(await check(account)).toEqual({ allowed: false, retryAfter: 2, unavailable: false });
    expect(await check(account)).toEqual({ allowed: false, retryAfter: 1, unavailable: false });
    expect(await check(account)).toEqual({ allowed: true, retryAfter: 0, unavailable: false });
  });
  it.each([null, [], [1, 1], ['1', 1, 20], [2, 1, 20], [1, 0, 20], [1, 6, 20], [1, 1, -1], [1, 1, 300001], [1, 1, NaN]])('rejects malformed replies %#', async (reply) => {
    redis.eval.mockResolvedValue(reply);
    expect(await check(account)).toEqual({ allowed: false, retryAfter: seconds, unavailable: true });
  });
  it.each(['', 'not-a-url', 'redis://fixture', 'https://user:secret@fixture', 'https://fixture?secret=value', 'https://fixture '])('denies invalid config before a request %#', async (url) => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', url);
    expect(await check(account)).toEqual({ allowed: false, retryAfter: seconds, unavailable: true });
    expect(redis.client).not.toHaveBeenCalled();
  });
  it('denies missing token and malformed account IDs', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect((await check(account)).unavailable).toBe(true);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-token');
    expect((await check('account with whitespace')).unavailable).toBe(true);
    expect(redis.client).not.toHaveBeenCalled();
  });
  it('fails closed without logging a service error that contains credentials', async () => {
    redis.eval.mockRejectedValue(new Error('private token or account data'));
    expect(await check(account)).toEqual({ allowed: false, retryAfter: seconds, unavailable: true });
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

it('keeps password-attempt, password-send and account keys separate', async () => {
  redis.eval.mockResolvedValue([1, 1, 1000]);
  await checkPasswordOperationRateLimit(account);
  await checkPasswordNonceSendRateLimit(account);
  await checkPasswordOperationRateLimit('00000000-0000-4000-8000-000000000002');
  expect(new Set(redis.eval.mock.calls.map((call) => call[1][0])).size).toBe(3);
});
