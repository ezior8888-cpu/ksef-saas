import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Worker pg-boss to osobny proces — nie ładuje `instrumentation.ts`, więc do
 * 01.10.2026 nie miał klienta Sentry i każdy alert z jobów (watchdog, RODO,
 * kopie zapasowe, UPO) był cichym no-opem.
 */

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  getClient: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock('@sentry/nextjs', () => sentry);

import { scrubTelemetry } from '@/lib/observability/scrub';
import {
  flushWorkerSentry,
  initWorkerSentry,
  reportExhaustedJob,
  reportWorkerStartupFailure,
} from '@/lib/jobs/sentry';

const PROD = { NODE_ENV: 'production', SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' };

beforeEach(() => {
  vi.clearAllMocks();
  sentry.getClient.mockReturnValue(undefined);
});

describe('Sentry w workerze pg-boss', () => {
  it('produkcja z DSN — klient z tymi samymi filtrami prywatności co Next', () => {
    expect(initWorkerSentry(PROD)).toBe(true);
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(sentry.init.mock.calls[0]![0]).toMatchObject({
      dsn: PROD.SENTRY_DSN,
      enabled: true,
      sendDefaultPii: false,
      beforeSend: scrubTelemetry,
      ignoreErrors: ['NonRetriableError'],
      initialScope: { tags: { runtime: 'pgboss-worker' } },
    });
  });

  it.each([
    ['bez SENTRY_DSN', { NODE_ENV: 'production' }],
    ['poza produkcją', { NODE_ENV: 'development', SENTRY_DSN: PROD.SENTRY_DSN }],
  ])('%s — worker wie, że alerty nie wyjdą', (_label, env) => {
    expect(initWorkerSentry(env)).toBe(false);
  });

  it('poza produkcją klient jest wyłączony', () => {
    initWorkerSentry({ NODE_ENV: 'development', SENTRY_DSN: PROD.SENTRY_DSN });
    expect(sentry.init.mock.calls[0]![0]).toMatchObject({ enabled: false });
  });

  it('klient już jest — bez drugiej inicjalizacji', () => {
    sentry.getClient.mockReturnValue({});
    expect(initWorkerSentry(PROD)).toBe(true);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('wyczerpany job idzie do Sentry z nazwą kolejki', () => {
    const error = new Error('paczka nie wyszła');
    reportExhaustedJob('exports.co-pilot.send-package', error, 'max-retries');
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { queue: 'exports.co-pilot.send-package', exhausted_reason: 'max-retries' },
    });
  });

  it('awaria startu i opróżnienie kolejki zdarzeń przed wyjściem', async () => {
    const error = new Error('brak bazy');
    reportWorkerStartupFailure(error);
    expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { phase: 'startup' } });
    sentry.flush.mockRejectedValueOnce(new Error('sieć'));
    await expect(flushWorkerSentry(10)).resolves.toBeUndefined();
    expect(sentry.flush).toHaveBeenCalledWith(10);
  });
});

describe('worker.ts korzysta z Sentry', () => {
  const source = readFileSync(join(process.cwd(), 'lib/jobs/worker.ts'), 'utf8');
  const main = source.slice(source.indexOf('async function main'));

  it('inicjalizacja na starcie, przed pg-boss', () => {
    expect(main.indexOf('initWorkerSentry()')).toBeGreaterThan(-1);
    expect(main.indexOf('initWorkerSentry()')).toBeLessThan(main.indexOf('startBoss()'));
  });

  it('wyczerpany job, awaria startu i zamknięcie procesu', () => {
    // Wrapper jobów przeniesiony z worker.ts do run-job.ts (AUD-35).
    const runJob = readFileSync(join(process.cwd(), 'lib/jobs/run-job.ts'), 'utf8');
    const exhausted = runJob.indexOf('wyczerpane próby');
    expect(exhausted).toBeGreaterThan(-1);
    expect(runJob.indexOf('reportExhaustedJob(def.queue, error, decision.reason)')).toBeGreaterThan(exhausted);
    expect(main).toContain('reportWorkerStartupFailure(err)');
    expect(main.split('flushWorkerSentry()').length - 1).toBe(2);
  });
});
