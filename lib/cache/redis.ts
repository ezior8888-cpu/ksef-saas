/**
 * Upstash Redis client — serverless edge-friendly KV cache.
 *
 * Dlaczego Upstash a nie ElastiCache / Redis Cloud:
 *   - Serverless: HTTP/REST API zamiast TCP, idealnie dopasowany do Vercel
 *     Functions (cold start nie zabija connection pool).
 *   - EU region (Frankfurt) — zgodność z hostingiem Supabase (Faza 1 spec).
 *   - Free tier do 10k requests/day i 256MB storage — wystarcza do 5k MAU.
 *
 * Lazy init: bez tego `next build` padałby przy importowaniu łańcucha
 * (np. server action → categorization → ai-classifier → ...), nawet gdy
 * build nie woła Redisa. Na Vercel trzeba ustawić UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN w env projektu.
 *
 * Tryb degradacji: gdy env vars nieustawione (np. lokalny dev bez Redisa),
 * exportowany `getRedis()` rzuca, ale `lib/cache/index.ts` łapie błąd i
 * przechodzi w tryb passthrough (bez cache). Aplikacja nigdy nie wybucha
 * przez brak cache — Redis jest tylko warstwą wydajności.
 */

import { Redis } from '@upstash/redis';

let cachedClient: Redis | null = null;

export function isRedisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  // Placeholder w .env.example to "https://xxx.upstash.io" / "xxx" — wykrywamy.
  if (!url || !token) return false;
  if (url.includes('xxx') || token.includes('xxx')) return false;
  return true;
}

export function getRedis(): Redis {
  if (cachedClient) return cachedClient;
  if (!isRedisConfigured()) {
    throw new Error('Redis not configured (missing UPSTASH_REDIS_REST_URL/TOKEN)');
  }
  cachedClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return cachedClient;
}
