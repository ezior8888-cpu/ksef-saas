import { createHash } from 'crypto';
import { getRedis, isRedisConfigured } from '@/lib/cache/redis';

export type RateLimitBucket =
  | 'login'
  | 'register'
  | 'password_reset'
  | 'two_factor_challenge'
  | 'gdpr_request'
  | 'support_chat';

export interface RateLimitConfig {
  /** Logiczny kubełek — jednoczęściowy prefix klucza Redis. */
  bucket: RateLimitBucket;
  /** Unikalny identyfikator (np. IP, email, IP+email). Hashowany przed zapisem. */
  identifier: string;
  /** Maksymalna liczba żądań w oknie. */
  limit: number;
  /** Długość okna w sekundach. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Sekund do najbliższej dozwolonej próby (0 gdy allowed=true). */
  retryAfter: number;
  /** Gdy Redis nieskonfigurowany lub padł — wpuszczamy ruch, ale flagujemy. */
  fallback?: boolean;
}

/**
 * Sliding window rate limiter na Upstash Redis (sorted set per identifier).
 *
 * Pipeline atomowo: usuń poza-oknem → dodaj teraz → zlicz → ustaw TTL.
 * Gdy count > limit — odrzucamy bieżący request (został już zapisany, ale
 * to OK, sliding window i tak go wymiotę po `windowSeconds`).
 *
 * Fail-open: brak Redisa nie może blokować logowania. Logujemy do konsoli
 * (Sentry łapie via console hook) i pozwalamy.
 */
export async function checkRateLimit(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    return {
      allowed: true,
      remaining: config.limit,
      retryAfter: 0,
      fallback: true,
    };
  }

  const key = `rl:${config.bucket}:${hashIdentifier(config.identifier)}`;
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const redis = getRedis();
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, { score: now, member });
    pipe.zcard(key);
    pipe.expire(key, config.windowSeconds);
    const results = await pipe.exec<[number, number, number, number]>();
    const count = results[2] ?? 0;

    const allowed = count <= config.limit;
    const remaining = Math.max(0, config.limit - count);

    if (allowed) {
      return { allowed: true, remaining, retryAfter: 0 };
    }

    // Najstarszy timestamp w oknie wyznacza moment, w którym slot się zwolni.
    const oldest = (await redis.zrange(key, 0, 0, {
      withScores: true,
    })) as Array<string | number>;
    let retryAfter = config.windowSeconds;
    if (oldest.length >= 2) {
      const oldestTs = Number(oldest[1]);
      retryAfter = Math.max(
        1,
        Math.ceil((oldestTs + config.windowSeconds * 1000 - now) / 1000),
      );
    }

    return { allowed: false, remaining: 0, retryAfter };
  } catch (err) {
    console.error('[rate-limit] Redis error, fail-open:', err);
    return {
      allowed: true,
      remaining: config.limit,
      retryAfter: 0,
      fallback: true,
    };
  }
}

/**
 * SHA-256 truncated do 32 znaków — nie trzymamy plaintext IP/email w Redis.
 * Drobna ochrona w razie wycieku snapshotu cache'a.
 */
export function hashIdentifier(id: string): string {
  return createHash('sha256').update(id.toLowerCase()).digest('hex').slice(0, 32);
}
