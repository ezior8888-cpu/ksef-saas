/**
 * Decyzje retry dla workera pg-boss — CZYSTA logika (testowalna bez DB).
 *
 * Parytet z Inngest:
 *   - `retries: N` w Inngest = N ponownych prób po pierwszej (N+1 wykonań).
 *     Tu: `maxRetries: N` + licznik wykonań `attempt` (0-based) w danych joba.
 *   - `RetryAfterJobError` wygrywa z domyślnym schedule (jawne opóźnienie).
 *   - `NonRetriableJobError` → natychmiast 'exhausted' (→ onExhausted,
 *     odpowiednik Inngest onFailure).
 *
 * WAŻNE: kolejki pg-boss tworzymy z `retryLimit: 0` — CAŁY retry jest tutaj.
 * Dzięki temu nie ma podwójnego liczenia prób (pg-boss + nasze).
 */

import { NonRetriableJobError, RetryAfterJobError } from './errors';

export interface RetryPolicy {
  /** Liczba PONOWNYCH prób po pierwszym wykonaniu (jak Inngest `retries`). */
  maxRetries: number;
  /** Opóźnienie przed próbą nr `attempt+1` (attempt 0-based = która próba padła). */
  getDelayMs(attempt: number): number;
}

export type RetryDecision =
  | { action: 'retry'; delayMs: number; nextAttempt: number }
  | { action: 'exhausted'; reason: 'non-retriable' | 'attempts-exhausted' };

export function decideRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
): RetryDecision {
  if (error instanceof NonRetriableJobError) {
    return { action: 'exhausted', reason: 'non-retriable' };
  }
  if (attempt >= policy.maxRetries) {
    return { action: 'exhausted', reason: 'attempts-exhausted' };
  }
  const delayMs =
    error instanceof RetryAfterJobError
      ? error.retryAfterMs
      : policy.getDelayMs(attempt);
  return { action: 'retry', delayMs, nextAttempt: attempt + 1 };
}

/** Domyślny backoff (odpowiednik defaultu Inngest): 10s → 30s → 1m → 5m → 15m, dalej 15m. */
const DEFAULT_DELAYS_MS = [10_000, 30_000, 60_000, 300_000, 900_000] as const;

export function defaultRetryDelayMs(attempt: number): number {
  return DEFAULT_DELAYS_MS[Math.min(attempt, DEFAULT_DELAYS_MS.length - 1)]!;
}

/** Klucz w danych joba przenoszący licznik wykonań między re-sendami. */
export const ATTEMPT_KEY = '__attempt' as const;

export function readAttempt(data: unknown): number {
  if (
    typeof data === 'object' &&
    data !== null &&
    ATTEMPT_KEY in data &&
    typeof (data as Record<string, unknown>)[ATTEMPT_KEY] === 'number'
  ) {
    return (data as Record<string, number>)[ATTEMPT_KEY]!;
  }
  return 0;
}
