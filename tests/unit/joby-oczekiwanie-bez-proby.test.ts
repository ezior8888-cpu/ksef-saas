import { describe, expect, it } from 'vitest';

import { RetryAfterError } from '@/lib/jobs/errors';
import { decideRetry, MAX_WAIT_RETRIES, readWaits, WAITS_KEY } from '@/lib/jobs/retry';

/**
 * S22 z rewizji 03.10.2026: `RetryAfterError` rzucany, bo trzeba POCZEKAĆ
 * (KSeF nadal przetwarza wcześniejszą wysyłkę, inna próba trzyma dzierżawę),
 * zużywał budżet `maxRetries` jak prawdziwa porażka — pięć takich odczekań
 * kończyło fakturę jako `failed`. Oczekiwanie ma własny, osobny limit.
 */

const policy = { maxRetries: 5, getDelayMs: () => 1000 };

describe('oczekiwanie bez zużycia próby', () => {
  it('zwykły RetryAfterError liczy się jako próba', () => {
    expect(decideRetry(new RetryAfterError('503', '2m'), 2, policy)).toEqual({
      action: 'retry', delayMs: 120_000, nextAttempt: 3, nextWaits: 0,
    });
  });

  it('RetryAfterError z countsAsAttempt=false nie zwiększa numeru próby, tylko licznik oczekiwań', () => {
    const wait = new RetryAfterError('inna próba trzyma wysyłkę', '5m', { countsAsAttempt: false });
    expect(wait.countsAsAttempt).toBe(false);
    expect(decideRetry(wait, 2, policy, 0)).toEqual({
      action: 'retry', delayMs: 300_000, nextAttempt: 2, nextWaits: 1,
    });
    // Nawet po wyczerpaniu zwykłych prób oczekiwanie nadal jest możliwe.
    expect(decideRetry(wait, 5, policy, 3)).toEqual({
      action: 'retry', delayMs: 300_000, nextAttempt: 5, nextWaits: 4,
    });
  });

  it('po limicie oczekiwań odczekanie zaczyna liczyć się jak próba', () => {
    const wait = new RetryAfterError('KSeF nadal przetwarza', '5m', { countsAsAttempt: false });
    expect(decideRetry(wait, 2, policy, MAX_WAIT_RETRIES)).toEqual({
      action: 'retry', delayMs: 300_000, nextAttempt: 3, nextWaits: MAX_WAIT_RETRIES,
    });
    expect(decideRetry(wait, 5, policy, MAX_WAIT_RETRIES)).toEqual({
      action: 'exhausted', reason: 'attempts-exhausted',
    });
  });

  it('licznik oczekiwań jedzie w danych joba pod kluczem technicznym', () => {
    expect(readWaits({ [WAITS_KEY]: 3 })).toBe(3);
    expect(readWaits({})).toBe(0);
    expect(readWaits(null)).toBe(0);
  });
});
