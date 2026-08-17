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

/**
 * Runnery są WSPÓŁDZIELONE z Inngest, więc rzucają jego klasy błędów
 * (`NonRetriableError`, `RetryAfterError`). Rozpoznajemy je po `name` —
 * dokładnie tak, jak robi to sam Inngest przy serializacji cross-process
 * (patrz komentarz w submit-invoice.ts). Bez tego job z NonRetriableError
 * byłby bezsensownie ponawiany zamiast trafić do `onExhausted`.
 */
function isNonRetriable(error: unknown): boolean {
  if (error instanceof NonRetriableJobError) return true;
  return error instanceof Error && error.name === 'NonRetriableError';
}

/** Jawne opóźnienie z błędu (nasz `RetryAfterJobError` lub Inngest `RetryAfterError`). */
function explicitRetryDelayMs(error: unknown): number | null {
  if (error instanceof RetryAfterJobError) return error.retryAfterMs;
  if (!(error instanceof Error) || error.name !== 'RetryAfterError') return null;

  // Inngest trzyma `retryAfter` jako łańcuch SEKUND ('30') albo Date.
  const raw = (error as { retryAfter?: unknown }).retryAfter;
  if (raw instanceof Date) return Math.max(0, raw.getTime() - Date.now());
  if (typeof raw === 'string' || typeof raw === 'number') {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return null;
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
