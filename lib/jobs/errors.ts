/**
 * Błędy sterujące retry w workerze pg-boss.
 *
 * Nazwy i konstruktory jak w dawnym SDK Inngest (etap 10: Inngest odpięty
 * 02.10.2026), żeby ciała jobów rzucały je bez zmian:
 *   - `NonRetriableError` — natychmiast kończy próby i woła `onExhausted`.
 *     Część jobów rozpoznaje go po `error.name === 'NonRetriableError'`
 *     (np. klasyfikacja odrzucenia w `onSubmitInvoiceExhausted`), więc nazwa
 *     jest częścią kontraktu.
 *   - `RetryAfterError` — retry z JAWNYM opóźnieniem (np. schedule KSeF
 *     30s→2m→5m→15m→1h) zamiast domyślnego. Opóźnienie: ms albo '30s'/'2m'.
 */

import { parseDurationMs } from './duration';

export class NonRetriableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NonRetriableError';
  }
}

export class RetryAfterError extends Error {
  /** Opóźnienie kolejnej próby w ms. */
  readonly retryAfterMs: number;

  constructor(
    message: string,
    retryAfter: string | number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RetryAfterError';
    this.retryAfterMs = parseDurationMs(retryAfter);
  }
}
