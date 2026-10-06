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
 * Retry merytoryczny (próby, opóźnienia, onExhausted) jest TUTAJ — pg-boss ma
 * w `QUEUE_POLICY` (boss.ts) tylko siatkę na joby zabite w trakcie
 * (heartbeat/expire, AUD-16), więc nie ma podwójnego liczenia prób. Takie
 * ponowienie porzuconego joba nie zwiększa `attempt` i po wyczerpaniu NIE woła
 * `onExhausted` — job zostaje w pg-boss jako `failed`.
 *
 * Oczekiwanie (S22): `RetryAfterError` z `countsAsAttempt: false` to „jeszcze
 * nie wiadomo, poczekaj” — nie zużywa próby, ma własny licznik `__waits`
 * z limitem `MAX_WAIT_RETRIES`; po limicie liczy się jak zwykła próba, żeby
 * zawieszona sprawa nie krążyła w nieskończoność.
 */

import { NonRetriableError, RetryAfterError } from './errors';

export interface RetryPolicy {
  /** Liczba PONOWNYCH prób po pierwszym wykonaniu (jak Inngest `retries`). */
  maxRetries: number;
  /** Opóźnienie przed próbą nr `attempt+1` (attempt 0-based = która próba padła). */
  getDelayMs(attempt: number): number;
}

export type RetryDecision =
  | { action: 'retry'; delayMs: number; nextAttempt: number; nextWaits: number }
  | { action: 'exhausted'; reason: 'non-retriable' | 'attempts-exhausted' };

/** Ile odczekań (bez zużycia próby) dopuszczamy na jeden job: 24 × 5 min ≈ 2 h. */
export const MAX_WAIT_RETRIES = 24;

/** Czy błąd prosi o odczekanie zamiast ponowienia liczonego jako próba. */
function isWaitError(error: unknown): boolean {
  return error instanceof Error && error.name === 'RetryAfterError' &&
    (error as { countsAsAttempt?: unknown }).countsAsAttempt === false;
}

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
  waits = 0,
): RetryDecision {
  if (isNonRetriable(error)) {
    return { action: 'exhausted', reason: 'non-retriable' };
  }
  const explicit = explicitRetryDelayMs(error);
  if (explicit !== null && isWaitError(error) && waits < MAX_WAIT_RETRIES) {
    return { action: 'retry', delayMs: explicit, nextAttempt: attempt, nextWaits: waits + 1 };
  }
  if (attempt >= policy.maxRetries) {
    return { action: 'exhausted', reason: 'attempts-exhausted' };
  }
  const delayMs = explicit ?? policy.getDelayMs(attempt);
  return { action: 'retry', delayMs, nextAttempt: attempt + 1, nextWaits: waits };
}

/** Domyślny backoff (odpowiednik defaultu Inngest): 10s → 30s → 1m → 5m → 15m, dalej 15m. */
const DEFAULT_DELAYS_MS = [10_000, 30_000, 60_000, 300_000, 900_000] as const;

export function defaultRetryDelayMs(attempt: number): number {
  return DEFAULT_DELAYS_MS[Math.min(attempt, DEFAULT_DELAYS_MS.length - 1)]!;
}

/** Klucz w danych joba przenoszący licznik wykonań między re-sendami. */
export const ATTEMPT_KEY = '__attempt' as const;
/** Klucz w danych joba przenoszący licznik odczekań (S22). */
export const WAITS_KEY = '__waits' as const;

function readCounter(data: unknown, key: string): number {
  if (
    typeof data === 'object' &&
    data !== null &&
    key in data &&
    typeof (data as Record<string, unknown>)[key] === 'number'
  ) {
    return (data as Record<string, number>)[key]!;
  }
  return 0;
}

export function readAttempt(data: unknown): number {
  return readCounter(data, ATTEMPT_KEY);
}

export function readWaits(data: unknown): number {
  return readCounter(data, WAITS_KEY);
}
