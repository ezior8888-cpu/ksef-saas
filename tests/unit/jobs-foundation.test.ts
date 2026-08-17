/**
 * Testy fundamentu lib/jobs/ (Etap 1 planu Etapu 7 — migracja na pg-boss).
 *
 * Krytyczne: parytet decyzji retry z Inngest (w tym schedule KSeF 30s→1h)
 * oraz alarm dryfu mapy eventów względem lib/inngest/client.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  NonRetriableError as InngestNonRetriableError,
  RetryAfterError as InngestRetryAfterError,
} from 'inngest';
import { describe, expect, it } from 'vitest';

import { parseDurationMs } from '@/lib/jobs/duration';
import { NonRetriableJobError, RetryAfterJobError } from '@/lib/jobs/errors';
import { CRON_JOBS, EVENT_QUEUE_MAP, queueForEvent } from '@/lib/jobs/queues';
import {
  ATTEMPT_KEY,
  decideRetry,
  defaultRetryDelayMs,
  readAttempt,
} from '@/lib/jobs/retry';
import { getKsefRetryDelay, KSEF_MAX_RETRIES } from '@/lib/inngest/retry-schedule';

describe('parseDurationMs', () => {
  it('parsuje jednostki z jobów Inngest', () => {
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('2m')).toBe(120_000);
    expect(parseDurationMs('1h')).toBe(3_600_000);
    expect(parseDurationMs('3d')).toBe(259_200_000);
    expect(parseDurationMs(1500)).toBe(1500);
  });

  it('odrzuca śmieci', () => {
    expect(() => parseDurationMs('abc')).toThrow();
    expect(() => parseDurationMs('30')).toThrow();
    expect(() => parseDurationMs(-1)).toThrow();
  });
});

describe('decideRetry — parytet z Inngest', () => {
  const policy = { maxRetries: 5, getDelayMs: defaultRetryDelayMs };

  it('NonRetriable → natychmiast exhausted (odpowiednik onFailure)', () => {
    const d = decideRetry(new NonRetriableJobError('walidacja'), 0, policy);
    expect(d).toEqual({ action: 'exhausted', reason: 'non-retriable' });
  });

  it('zwykły błąd → retry z default schedule i inkrementacją attempt', () => {
    const d = decideRetry(new Error('ECONNRESET'), 0, policy);
    expect(d).toEqual({ action: 'retry', delayMs: 10_000, nextAttempt: 1 });
  });

  it('RetryAfter wygrywa z default schedule (jawne opóźnienie)', () => {
    const d = decideRetry(new RetryAfterJobError('KSeF 503', '2m'), 1, policy);
    expect(d).toEqual({ action: 'retry', delayMs: 120_000, nextAttempt: 2 });
  });

  it('wyczerpanie prób: attempt >= maxRetries → exhausted', () => {
    const d = decideRetry(new Error('x'), 5, policy);
    expect(d).toEqual({ action: 'exhausted', reason: 'attempts-exhausted' });
  });

  it('PEŁNY schedule KSeF 30s→2m→5m→15m→1h przechodzi 1:1', () => {
    const ksefPolicy = {
      maxRetries: KSEF_MAX_RETRIES,
      getDelayMs: (a: number) => parseDurationMs(getKsefRetryDelay(a)),
    };
    const expected = [30_000, 120_000, 300_000, 900_000, 3_600_000];
    for (let attempt = 0; attempt < KSEF_MAX_RETRIES; attempt++) {
      const d = decideRetry(new Error('503'), attempt, ksefPolicy);
      expect(d).toEqual({
        action: 'retry',
        delayMs: expected[attempt],
        nextAttempt: attempt + 1,
      });
    }
    // 6. wykonanie (attempt=5) → exhausted → ścieżka Offline24 w onExhausted.
    expect(decideRetry(new Error('503'), KSEF_MAX_RETRIES, ksefPolicy)).toEqual({
      action: 'exhausted',
      reason: 'attempts-exhausted',
    });
  });
});

describe('decideRetry — błędy KLAS INNGEST (runnery są współdzielone)', () => {
  const policy = { maxRetries: 5, getDelayMs: defaultRetryDelayMs };

  it('NonRetriableError z pakietu inngest → exhausted (regresja: E2E paczki C)', () => {
    // Realny błąd wykryty w E2E: job rzucał klasę Inngest, a worker ponawiał
    // go zamiast wywołać onExhausted (pasek postępu w UI wisiałby w nieskończoność).
    const err = new InngestNonRetriableError('Job nie istnieje');
    expect(decideRetry(err, 0, policy)).toEqual({
      action: 'exhausted',
      reason: 'non-retriable',
    });
  });

  it('RetryAfterError z pakietu inngest → honoruje jego opóźnienie (sekundy!)', () => {
    // KRYTYCZNE dla paczki D: cały schedule KSeF 30s→1h jedzie na tej klasie.
    const err = new InngestRetryAfterError('KSeF 503', '30s');
    expect(decideRetry(err, 0, policy)).toEqual({
      action: 'retry',
      delayMs: 30_000,
      nextAttempt: 1,
    });
    expect(decideRetry(new InngestRetryAfterError('x', '1h'), 2, policy)).toEqual({
      action: 'retry',
      delayMs: 3_600_000,
      nextAttempt: 3,
    });
  });

  it('RetryAfterError nie omija limitu prób', () => {
    const err = new InngestRetryAfterError('KSeF 503', '30s');
    expect(decideRetry(err, 5, policy)).toEqual({
      action: 'exhausted',
      reason: 'attempts-exhausted',
    });
  });
});

describe('readAttempt', () => {
  it('czyta licznik z danych joba, default 0', () => {
    expect(readAttempt({ [ATTEMPT_KEY]: 3, foo: 1 })).toBe(3);
    expect(readAttempt({ foo: 1 })).toBe(0);
    expect(readAttempt(null)).toBe(0);
  });
});

describe('EVENT_QUEUE_MAP — alarm dryfu względem lib/inngest/client.ts', () => {
  it('pokrywa DOKŁADNIE eventy zdefiniowane w kliencie Inngest', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/client.ts'),
      'utf8',
    );
    const inClient = new Set(
      [...src.matchAll(/'([a-z]+\/[a-z0-9.-]+)'/g)].map((m) => m[1]!),
    );
    const inMap = new Set(Object.keys(EVENT_QUEUE_MAP));

    const missingInMap = [...inClient].filter((e) => !inMap.has(e)).sort();
    const extraInMap = [...inMap].filter((e) => !inClient.has(e)).sort();

    expect(missingInMap, 'eventy w kliencie bez kolejki').toEqual([]);
    expect(extraInMap, 'kolejki bez eventu w kliencie').toEqual([]);
  });

  it('nazwy kolejek w bezpiecznym charsecie, bez duplikatów', () => {
    const queues = Object.values(EVENT_QUEUE_MAP);
    for (const q of queues) expect(q).toMatch(/^[a-z0-9.-]+$/);
    expect(new Set(queues).size).toBe(queues.length);
  });

  it('queueForEvent rzuca na nieznanym evencie', () => {
    expect(() => queueForEvent('foo/bar')).toThrow(/Nieznany event/);
  });
});

describe('CRON_JOBS', () => {
  it('22 crony (inwentaryzacja 17 sie 2026), unikalne kolejki cron.*', () => {
    expect(CRON_JOBS.length).toBe(22);
    const queues = CRON_JOBS.map((c) => c.queue);
    expect(new Set(queues).size).toBe(queues.length);
    for (const c of CRON_JOBS) {
      expect(c.queue).toMatch(/^cron\.[a-z0-9-]+$/);
      expect(c.cron.trim().split(/\s+/).length).toBe(5);
    }
  });
});
