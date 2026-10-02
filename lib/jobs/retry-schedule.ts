/**
 * Custom retry schedule dla KSeF submit (Faza 23 sekcja 2).
 *
 * Spec: 30s → 2min → 5min → 15min → 1h. Pięć opóźnień = pięć retries =
 * sześć prób (initial + 5 retries). Po wyczerpaniu worker woła `onExhausted`
 * (`onSubmitInvoiceExhausted`) — dziś bez Offline24 (wstrzymany 02.10.2026).
 *
 * Dlaczego custom zamiast domyślnego backoffu workera:
 *   - domyślny (`defaultRetryDelayMs`) to 10s, 30s, 1m, 5m, 15m
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
 *   attempt 5 → fail → onExhausted
 */

/** Czas jak w `parseDurationMs`: '30s', '2m', '1h'. */
export type DurationStr = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

import { KsefApiError } from '@/lib/ksef/client';

/**
 * Maksymalna liczba ponowień joba wysyłki (`maxRetries` w rejestrze workera).
 * Initial attempt + 5 retries = 6 prób total = 5 delay'ów ze schedulu poniżej.
 */
export const KSEF_MAX_RETRIES = 5;

/**
 * Schedule opóźnień przed kolejną próbą. Index = numer aktualnej (failed)
 * próby (zero-indexed, jak `attempt` w kontekście joba).
 */
const KSEF_BACKOFF_SCHEDULE = [
  '30s', // po fail #0
  '2m', // po fail #1
  '5m', // po fail #2
  '15m', // po fail #3
  '1h', // po fail #4
] as const satisfies readonly DurationStr[];

/**
 * Zwraca opóźnienie do `RetryAfterError`, biorąc pod uwagę numer próby.
 * Po wyczerpaniu schedulu — fallback do max (1h), żeby nie crashować z
 * out-of-bounds (defensive: gdyby ktoś podniósł `retries` ponad 5).
 */
export function getKsefRetryDelay(attempt: number): DurationStr {
  if (attempt < 0) return KSEF_BACKOFF_SCHEDULE[0];
  if (attempt >= KSEF_BACKOFF_SCHEDULE.length) {
    return KSEF_BACKOFF_SCHEDULE[KSEF_BACKOFF_SCHEDULE.length - 1]!;
  }
  return KSEF_BACKOFF_SCHEDULE[attempt]!;
}

/** Górna granica oczekiwania z `Retry-After` — dłużej czeka już Offline24. */
const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * Opóźnienie ponowienia wysyłki: `Retry-After` z KSeF ma pierwszeństwo
 * przed harmonogramem (AUD-92), ale nie dłużej niż godzinę.
 */
export function ksefRetryDelayFor(error: unknown, attempt: number): DurationStr {
  if (error instanceof KsefApiError && error.retryAfterMs !== null) {
    const seconds = Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(error.retryAfterMs / 1000)));
    return `${seconds}s`;
  }
  return getKsefRetryDelay(attempt);
}

/**
 * Limit równoległości per tenant dla `submit-invoice` (Faza 23 sekcja 2) —
 * `groupConcurrency` kolejki w workerze pg-boss. Dawny limit tempa (60/min)
 * był tylko w Inngest; tempo wobec KSeF pilnuje limiter per NIP.
 *
 * NIP byłby gorszym kluczem — multi-org pozwala mieć kilku tenantów z tym
 * samym NIP-em (Faza 36 multi-org). Tenant_id jest naturalnym kluczem.
 */
export const KSEF_TENANT_CONCURRENCY_LIMIT = 100;
