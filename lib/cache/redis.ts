/**
 * Klient Redisa po HTTP (biblioteka `@upstash/redis`).
 *
 * Gdzie stoi Redis (stan 23.10.2026): własny redis:7.2 na serwerze app-1
 * (Hetzner) z nakładką `hiett/serverless-redis-http`, która wystawia REST API
 * zgodne z Upstash. Korzystają z niego aplikacja i worker jobów. Nazwy
 * UPSTASH_REDIS_REST_URL / _TOKEN i biblioteka zostały z czasów Vercela —
 * to zgodność API, nie dostawca: Upstash Inc. nie przetwarza naszych danych
 * (dlatego nie ma go w `lib/legal/subprocessors.ts`).
 *
 * Lazy init: bez tego `next build` padałby przy importowaniu łańcucha
 * (np. server action → categorization → ai-classifier → ...), nawet gdy
 * build nie woła Redisa.
 *
 * Brak konfiguracji (np. lokalny dev bez Redisa): `getRedis()` rzuca,
 * a `lib/cache/index.ts` łapie błąd i przechodzi w passthrough (bez cache).
 * To NIE znaczy, że cała aplikacja działa bez Redisa. Bez niego (i przy jego
 * awarii) odmawiają — to jedyna pełna lista, inne pliki odsyłają tutaj:
 *   - limitery MFA i hasła (`lib/rate-limit/mfa.ts`, `password.ts`,
 *     fail-closed): logowanie z 2FA, włączanie 2FA, zmiana i reset hasła,
 *     ponowne uwierzytelnienie (`lib/auth/reauth.ts`: wyłączenie 2FA,
 *     usunięcie konta RODO i jego anulowanie);
 *   - akcje, które `fallback: true` z ogólnego limitera
 *     (`lib/rate-limit/index.ts` liczy wtedy w pamięci) traktują jak odmowę:
 *     wgranie certyfikatu KSeF (`components/settings/actions.ts`) i podgląd
 *     przypomnienia o płatności (`app/actions/reminders.ts`).
 */

import { Redis } from '@upstash/redis';

let cachedClient: Redis | null = null;

export function isRedisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  // Zaślepki typu "https://xxx.upstash.io" / "xxx" traktujemy jak brak konfiguracji.
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
