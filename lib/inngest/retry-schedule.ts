/**
 * Custom retry schedule dla KSeF submit (Faza 23 sekcja 2).
 *
 * Spec: 30s → 2min → 5min → 15min → 1h. Pięć opóźnień = pięć retries =
 * sześć prób (initial + 5 retries). Po wyczerpaniu Inngest woła `onFailure`,
 * który przerzuca fakturę do Offline24 queue (Faza 23 sekcja 3).
 *
 * Dlaczego custom zamiast Inngest defaultu:
 *   - Inngest default robi exponential backoff z bazą 10s (10s, 30s, 1m, 5m, 15m)
 *   - My chcemy bardziej agresywny pierwszy retry (30s zamiast 10s), bo wiemy
 *     z prior projektów że MF rate-limity per-sekundę są chwilowe
 *   - Ostatni retry o 1h daje MF czas na recovery po większej awarii
 *     (np. wszystkie maintenance windowy < 1h)
 *
 * Schedule mapuje "after fail N → wait X before attempt N+1":
 *
 *   attempt 0 → fail → wait 30s  → attempt 1
 *   attempt 1 → fail → wait 2m   → attempt 2
 *   attempt 2 → fail → wait 5m   → attempt 3
 *   attempt 3 → fail → wait 15m  → attempt 4
 *   attempt 4 → fail → wait 1h   → attempt 5
 *   attempt 5 → fail → onFailure (Offline24 queue)
 */

import type { TimeStr } from 'inngest';

/**
 * Maksymalna liczba retries w `inngest.createFunction({ retries: ... })`.
 * Initial attempt + 5 retries = 6 prób total = 5 delay'ów ze schedulu poniżej.
 */
export const KSEF_MAX_RETRIES = 5;

/**
 * Schedule opóźnień przed kolejną próbą. Index = numer aktualnej (failed)
 * próby (zero-indexed, jak w `event.event.attempt`).
 *
 * Inngest TimeStr: '30s' | '2m' | '5m' | '15m' | '1h' (zgodne z DurationLike).
 */
const KSEF_BACKOFF_SCHEDULE = [
  '30s', // po fail #0
  '2m', // po fail #1
  '5m', // po fail #2
  '15m', // po fail #3
  '1h', // po fail #4
] as const satisfies readonly TimeStr[];

/**
 * Zwraca opóźnienie do `RetryAfterError`, biorąc pod uwagę numer próby.
 * Po wyczerpaniu schedulu — fallback do max (1h), żeby nie crashować z
 * out-of-bounds (defensive: gdyby ktoś podniósł `retries` ponad 5).
 */
export function getKsefRetryDelay(attempt: number): TimeStr {
  if (attempt < 0) return KSEF_BACKOFF_SCHEDULE[0];
  if (attempt >= KSEF_BACKOFF_SCHEDULE.length) {
    return KSEF_BACKOFF_SCHEDULE[KSEF_BACKOFF_SCHEDULE.length - 1]!;
  }
  return KSEF_BACKOFF_SCHEDULE[attempt]!;
}

/**
 * Limity per-tenant dla `submit-invoice` (Faza 23 sekcja 2):
 *   - max 100 równoległych zadań per tenant (concurrency)
 *   - max 60 wysyłek na minutę per tenant (throttle)
 *
 * NIP byłby gorszym key'em — multi-org pozwala mieć kilku tenantów z tym
 * samym NIP-em (Faza 36 multi-org). Tenant_id jest natural key.
 */
export const KSEF_TENANT_CONCURRENCY_LIMIT = 100;
export const KSEF_TENANT_THROTTLE_LIMIT = 60;
export const KSEF_TENANT_THROTTLE_PERIOD = '1m' as const satisfies TimeStr;
