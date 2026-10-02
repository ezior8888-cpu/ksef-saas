/**
 * Decyzje retry dla workera pg-boss — CZYSTA logika (testowalna bez DB).
 *
 * Parytet z Inngest:
 *   - `retries: N` w Inngest = N ponownych prób po pierwszej (N+1 wykonań).
 *     Tu: `maxRetries: N` + licznik wykonań `attempt` (0-based) w danych joba.
 *   - `RetryAfterError` wygrywa z domyślnym schedule (jawne opóźnienie).
 *   - `NonRetriableError` → natychmiast 'exhausted' (→ onExhausted,
 *     odpowiednik Inngest onFailure).
 *
 * WAŻNE: kolejki pg-boss tworzymy z `retryLimit: 0` — CAŁY retry jest tutaj.
 * Dzięki temu nie ma podwójnego liczenia prób (pg-boss + nasze).
 */

import { NonRetriableError, RetryAfterError } from './errors';

export interface RetryPolicy {
  /** Liczba PONOWNYCH prób po pierwszym wykonaniu (jak Inngest `retries`). */
  maxRetries: number;
  /** Opóźnienie przed próbą nr `attempt+1` (attempt 0-based = która próba padła). */
  getDelayMs(attempt: number): number;
}

export type RetryDecision =
  | { action: 'retry'; delayMs: number; nextAttempt: number }
  | { action: 'exhausted'; reason: 'non-retriable' | 'attempts-exhausted' };

/**
 * `NonRetriableError` z `./errors`. Rozpoznajemy także po `name` — błąd
 * z innej instancji modułu (np. po `vi.resetModules` w testach) nie przejdzie
 * `instanceof`, a job nie może być wtedy bezsensownie ponawiany.
 */
function isNonRetriable(error: unknown): boolean {
  if (error instanceof NonRetriableError) return true;
  return error instanceof Error && error.name === 'NonRetriableError';
}

/** Jawne opóźnienie z `RetryAfterError` (ms). */
function explicitRetryDelayMs(error: unknown): number | null {
  if (error instanceof RetryAfterError) return error.retryAfterMs;
  if (!(error instanceof Error) || error.name !== 'RetryAfterError') return null;
  const ms = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function decideRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
): RetryDecision {
  if (isNonRetriable(error)) {
    return { action: 'exhausted', reason: 'non-retriable' };
  }
  if (attempt >= policy.maxRetries) {
    return { action: 'exhausted', reason: 'attempts-exhausted' };
  }
  const explicit = explicitRetryDelayMs(error);
  const delayMs = explicit ?? policy.getDelayMs(attempt);
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
