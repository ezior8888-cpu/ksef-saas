/**
 * Błędy sterujące retry w workerze pg-boss (Etap 7 migracji).
 *
 * Semantyka 1:1 z klasami Inngest używanymi w jobach:
 *   - `NonRetriableJobError` ⇔ inngest.NonRetriableError — natychmiast kończy
 *     próby i woła `onExhausted` (odpowiednik `onFailure`).
 *   - `RetryAfterJobError` ⇔ inngest.RetryAfterError — retry z JAWNYM
 *     opóźnieniem (np. schedule KSeF 30s→2m→5m→15m→1h) zamiast domyślnego.
 *
 * Port joba = zmiana importu z 'inngest' na ten moduł; logika bez zmian.
 */

import { parseDurationMs } from './duration';

export class NonRetriableJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NonRetriableJobError';
  }
}

export class RetryAfterJobError extends Error {
  /** Opóźnienie kolejnej próby w ms. */
  readonly retryAfterMs: number;

  constructor(
    message: string,
    retryAfter: string | number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RetryAfterJobError';
    this.retryAfterMs = parseDurationMs(retryAfter);
  }
}
