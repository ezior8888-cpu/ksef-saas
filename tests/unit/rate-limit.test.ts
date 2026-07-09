import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkRateLimit, hashIdentifier } from '@/lib/rate-limit';

/**
 * TEST-3 (audyt przedlaunchowy): rate limiter chroni login/register/reset przed
 * brute-force. Krytyczne: (a) fail-OPEN gdy Redis padł — rate-limit NIE może
 * zablokować logowania całej apce; (b) hash identyfikatora — nie trzymamy
 * plaintext IP/email w Redis.
 */

const REDIS_ENV = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;

describe('hashIdentifier — nie trzymamy plaintext', () => {
  it('deterministyczny dla tego samego wejścia', () => {
    expect(hashIdentifier('user@example.com')).toBe(hashIdentifier('user@example.com'));
  });

  it('case-insensitive (email normalizowany)', () => {
    expect(hashIdentifier('User@Example.COM')).toBe(hashIdentifier('user@example.com'));
  });

  it('różne wejścia ⇒ różne hashe', () => {
    expect(hashIdentifier('a@x.com')).not.toBe(hashIdentifier('b@x.com'));
  });

  it('wynik to 32 znaki hex, NIE zawiera plaintextu', () => {
    const h = hashIdentifier('sekretny@email.pl');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('sekretny');
    expect(h).not.toContain('email');
  });

  it('192.168.1.1 (IP) też zahashowany', () => {
    const h = hashIdentifier('192.168.1.1');
    expect(h).not.toContain('192');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('checkRateLimit — fail-open bez Redis', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of REDIS_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of REDIS_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('brak Redis ⇒ allowed=true + fallback=true (nie blokuje logowania)', async () => {
    const r = await checkRateLimit({
      bucket: 'login',
      identifier: 'test@example.com',
      limit: 5,
      windowSeconds: 900,
    });
    expect(r.allowed).toBe(true);
    expect(r.fallback).toBe(true);
    expect(r.retryAfter).toBe(0);
    expect(r.remaining).toBe(5);
  });

  it('fail-open dla każdego bucketu', async () => {
    for (const bucket of ['login', 'register', 'password_reset', 'support_chat'] as const) {
      const r = await checkRateLimit({ bucket, identifier: 'x', limit: 3, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
      expect(r.fallback).toBe(true);
    }
  });
});
