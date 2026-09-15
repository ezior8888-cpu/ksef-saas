import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashIdentifier } from '@/lib/rate-limit';
import { checkMfaRateLimit } from '@/lib/rate-limit/mfa';

const redis = vi.hoisted(() => {
  const evalCommand = vi.fn<
    (script: string, keys: string[], args: number[]) => Promise<unknown>
  >();
  return {
    evalCommand,
    getRedis: vi.fn(() => ({ eval: evalCommand })),
  };
});

vi.mock('@/lib/cache/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cache/redis')>();
  return { ...actual, getRedis: redis.getRedis };
});

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const UNAVAILABLE = { allowed: false, retryAfter: 300, unavailable: true };

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'unit-test-token');
  redis.evalCommand.mockReset();
  redis.getRedis.mockReset();
  redis.getRedis.mockReturnValue({ eval: redis.evalCommand });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('checkMfaRateLimit — account limit', () => {
  it('allows the first five accepted counts and denies the sixth attempt', async () => {
    // Redis is the dependency boundary: these are EVAL replies, not a mock of
    // the limiter. Executing the Lua itself requires a separate Redis test.
    for (let count = 1; count <= 5; count++) {
      redis.evalCommand.mockResolvedValueOnce([1, count, 300_000]);
    }
    redis.evalCommand.mockResolvedValueOnce([0, 5, 300_000]);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await checkMfaRateLimit(USER_ID)).toEqual({
        allowed: true,
        retryAfter: 0,
        unavailable: false,
      });
    }
    expect(await checkMfaRateLimit(USER_ID)).toEqual({
      allowed: false,
      retryAfter: 300,
      unavailable: false,
    });
    expect(redis.evalCommand).toHaveBeenCalledTimes(6);
  });

  it('uses one EVAL with one stable hashed account key and fixed policy arguments', async () => {
    redis.evalCommand.mockResolvedValue([1, 1, 300_000]);
    await checkMfaRateLimit(USER_ID);
    await checkMfaRateLimit(USER_ID);
    await checkMfaRateLimit(OTHER_USER_ID);

    const firstCall = redis.evalCommand.mock.calls[0];
    expect(firstCall).toEqual([
      expect.any(String),
      [`rl:mfa:account:${hashIdentifier(USER_ID)}`],
      [5, 300_000],
    ]);
    expect(redis.evalCommand.mock.calls[1]).toEqual(firstCall);
    expect(redis.evalCommand.mock.calls[2][1]).toEqual([
      `rl:mfa:account:${hashIdentifier(OTHER_USER_ID)}`,
    ]);
    expect(JSON.stringify(redis.evalCommand.mock.calls)).not.toContain(USER_ID);
    // The mock exposes only EVAL: a pipeline or separate Redis writes fail.
    expect(redis.evalCommand).toHaveBeenCalledTimes(3);
  });

  it.each([
    [300_000, 300],
    [120_001, 121],
    [120_000, 120],
    [999, 1],
    [1, 1],
    [0, 1],
  ])('reports remaining TTL %i ms as %i seconds', async (ttl, retryAfter) => {
    redis.evalCommand.mockResolvedValue([0, 5, ttl]);
    expect(await checkMfaRateLimit(USER_ID)).toEqual({
      allowed: false,
      retryAfter,
      unavailable: false,
    });
  });

  it('uses the existing window TTL during a block and permits a new window reply', async () => {
    redis.evalCommand
      .mockResolvedValueOnce([0, 5, 300_000])
      .mockResolvedValueOnce([0, 5, 60_000])
      .mockResolvedValueOnce([0, 5, 0])
      .mockResolvedValueOnce([1, 1, 300_000]);

    expect((await checkMfaRateLimit(USER_ID)).retryAfter).toBe(300);
    expect((await checkMfaRateLimit(USER_ID)).retryAfter).toBe(60);
    expect((await checkMfaRateLimit(USER_ID)).retryAfter).toBe(1);
    expect(await checkMfaRateLimit(USER_ID)).toEqual({
      allowed: true,
      retryAfter: 0,
      unavailable: false,
    });
  });

  it('supports the configured HTTP bridge used by self-hosted Redis', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://redis-bridge.internal:8080');
    redis.evalCommand.mockResolvedValue([1, 1, 300_000]);
    expect((await checkMfaRateLimit(USER_ID)).allowed).toBe(true);
  });
});

describe('checkMfaRateLimit — fail closed', () => {
  it.each<{ name: string; reply: unknown }>([
    { name: 'missing reply', reply: undefined },
    { name: 'null reply', reply: null },
    { name: 'object instead of tuple', reply: { allowed: true } },
    { name: 'empty tuple', reply: [] },
    { name: 'missing TTL', reply: [1, 1] },
    { name: 'extra field', reply: [1, 1, 300_000, 0] },
    { name: 'string allow flag', reply: ['1', 1, 300_000] },
    { name: 'boolean allow flag', reply: [true, 1, 300_000] },
    { name: 'negative allow flag', reply: [-1, 1, 300_000] },
    { name: 'unknown allow flag', reply: [2, 1, 300_000] },
    { name: 'string count', reply: [1, '1', 300_000] },
    { name: 'missing count', reply: [1, undefined, 300_000] },
    { name: 'zero count', reply: [1, 0, 300_000] },
    { name: 'negative count', reply: [1, -1, 300_000] },
    { name: 'fractional count', reply: [1, 1.5, 300_000] },
    { name: 'overflow count', reply: [1, 6, 300_000] },
    { name: 'unsafe count', reply: [1, Number.MAX_SAFE_INTEGER + 1, 300_000] },
    { name: 'NaN count', reply: [1, Number.NaN, 300_000] },
    { name: 'infinite count', reply: [1, Infinity, 300_000] },
    { name: 'denial below the limit', reply: [0, 4, 300_000] },
    { name: 'string TTL', reply: [1, 1, '300000'] },
    { name: 'null TTL', reply: [1, 1, null] },
    { name: 'missing key TTL', reply: [1, 1, -2] },
    { name: 'persistent key TTL', reply: [1, 1, -1] },
    { name: 'fractional TTL', reply: [1, 1, 10.5] },
    { name: 'window overflow TTL', reply: [1, 1, 300_001] },
    { name: 'unsafe TTL', reply: [1, 1, Number.MAX_SAFE_INTEGER + 1] },
    { name: 'NaN TTL', reply: [1, 1, Number.NaN] },
    { name: 'infinite TTL', reply: [1, 1, Infinity] },
  ])('rejects $name', async ({ reply }) => {
    redis.evalCommand.mockResolvedValue(reply);
    expect(await checkMfaRateLimit(USER_ID)).toEqual(UNAVAILABLE);
  });

  it.each([
    ['', 'unit-test-token'],
    ['https://redis.example.test', ''],
    ['https://xxx.upstash.io', 'xxx'],
    ['not-a-url', 'unit-test-token'],
    ['redis://redis.example.test', 'unit-test-token'],
    ['https://redis.example.test ', 'unit-test-token'],
    ['https://redis.example.test', 'unit-test-token\n'],
    ['https://user:password@redis.example.test', 'unit-test-token'],
    ['https://redis.example.test?token=value', 'unit-test-token'],
  ])('rejects missing or invalid Redis configuration %#', async (url, token) => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', url);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', token);
    expect(await checkMfaRateLimit(USER_ID)).toEqual(UNAVAILABLE);
    expect(redis.getRedis).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('rejects unset Redis environment variables', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    expect(await checkMfaRateLimit(USER_ID)).toEqual(UNAVAILABLE);
    expect(redis.getRedis).not.toHaveBeenCalled();
  });

  it.each(['', ' ', ' account', 'account ', 'account\nvalue', 'account\0value', 'konto-ą', 'x'.repeat(129)])(
    'rejects an invalid account identifier %# before Redis',
    async (userId) => {
      expect(await checkMfaRateLimit(userId)).toEqual(UNAVAILABLE);
      expect(redis.getRedis).not.toHaveBeenCalled();
    },
  );

  it('rejects a Redis client initialization failure without exposing its error', async () => {
    redis.getRedis.mockImplementation(() => {
      throw new Error(`sensitive-client-error:${USER_ID}:unit-test-token`);
    });
    expect(await checkMfaRateLimit(USER_ID)).toEqual(UNAVAILABLE);
    expect(redis.evalCommand).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('rejects an EVAL failure without exposing error text or input', async () => {
    redis.evalCommand.mockRejectedValue(
      new Error(`sensitive-command-error:${USER_ID}:unit-test-token:192.0.2.1`),
    );
    expect(await checkMfaRateLimit(USER_ID)).toEqual(UNAVAILABLE);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
