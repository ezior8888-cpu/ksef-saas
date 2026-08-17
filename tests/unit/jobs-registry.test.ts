/**
 * Testy rejestru handlerów (Etap 7, paczki A-B).
 *
 * Cel: wyłapać rozjazd między zarejestrowanymi kolejkami a mapą
 * `lib/jobs/queues.ts` ZANIM worker wystartuje na produkcji — literówka
 * w nazwie kolejki oznaczałaby cicho nieobsługiwany job.
 */

import { describe, expect, it } from 'vitest';

import { allEventQueues, CRON_JOBS } from '@/lib/jobs/queues';
import { getRegisteredJobs } from '@/lib/jobs/registry';

// Side-effect: rejestracje paczek.
import '@/lib/jobs/handlers/package-a';
import '@/lib/jobs/handlers/package-b';
import '@/lib/jobs/handlers/package-c';
import '@/lib/jobs/handlers/package-d';

const registered = getRegisteredJobs();
const queues = registered.map((j) => j.queue);

describe('rejestr jobów', () => {
  it('nie ma duplikatów kolejek', () => {
    expect(new Set(queues).size).toBe(queues.length);
  });

  it('każda zarejestrowana kolejka istnieje w queues.ts', () => {
    const known = new Set<string>([
      ...CRON_JOBS.map((c) => c.queue),
      ...allEventQueues(),
    ]);
    const unknown = queues.filter((q) => !known.has(q));
    expect(unknown, 'kolejki spoza queues.ts (literówka?)').toEqual([]);
  });

  it('paczka A: 12 cronów utrzymaniowych', () => {
    const packageA = [
      'cron.archive-old-invoices',
      'cron.cert-expiry-alert',
      'cron.cleanup-audit-logs',
      'cron.cleanup-old-backups',
      'cron.daily-db-snapshot',
      'cron.gdpr-process-deletions',
      'cron.jobs-watchdog',
      'cron.ksef-health-check',
      'cron.nightly-validation-recheck',
      'cron.refresh-materialized-views',
      'cron.retention-delete',
      'cron.verify-backup',
    ];
    for (const q of packageA) expect(queues, `brak ${q}`).toContain(q);
  });

  it('paczka B: 17 jobów e-mail/billing/przypomnienia', () => {
    const packageB = [
      'cron.critical-alerts-monitor',
      'cron.daily-analytics-digest',
      'cron.daily-summary-email',
      'cron.reminder-scheduler',
      'cron.trial-countdown-emails',
      'cron.weekly-business-review',
      'invoice.submit.succeeded.notify',
      'invoice.submit.failed.notify',
      'billing.payment.failed',
      'reminders.send.requested',
      'invoice.payment.received',
      'user.registered',
      'email.trial-day-1',
      'email.trial-day-4',
      'email.trial-day-8',
      'email.trial-day-12',
      'email.trial-day-14',
    ];
    expect(packageB.length).toBe(17);
    for (const q of packageB) expect(queues, `brak ${q}`).toContain(q);
  });

  it('parytet retries z konfiguracją Inngest (kluczowe joby)', () => {
    const byQueue = new Map(registered.map((j) => [j.queue, j]));
    // Powiadomienia i sekwencja: 2 (lepiej nie wysłać niż wysłać 4×).
    expect(byQueue.get('invoice.submit.succeeded.notify')?.maxRetries).toBe(2);
    expect(byQueue.get('user.registered')?.maxRetries).toBe(2);
    // Billing/przypomnienia: 3.
    expect(byQueue.get('billing.payment.failed')?.maxRetries).toBe(3);
    expect(byQueue.get('reminders.send.requested')?.maxRetries).toBe(3);
    // Nightly validation: 1 (jak w Inngest).
    expect(byQueue.get('cron.nightly-validation-recheck')?.maxRetries).toBe(1);
    // Reszta: default Inngest 4.
    expect(byQueue.get('cron.daily-summary-email')?.maxRetries).toBe(4);
  });

  it('dunning ma limit równoległości per tenant (grupa pg-boss)', () => {
    const dunning = registered.find((j) => j.queue === 'billing.payment.failed');
    expect(dunning?.groupConcurrency).toBe(1);
  });

  it('paczka C: 8 jobów OCR/importy/eksporty', () => {
    const packageC = [
      'cron.co-pilot-monthly',
      'ocr.process-photo',
      'inbox.invoice.received',
      'import.file.uploaded',
      'validation.bulk-contractors.requested',
      'import.ksef-history.requested',
      'exports.generate.requested',
      'exports.co-pilot.send-package',
    ];
    expect(packageC.length).toBe(8);
    for (const q of packageC) expect(queues, `brak ${q}`).toContain(q);
  });

  it('joby z onFailure w Inngest mają odpowiednik onExhausted', () => {
    // Bez tego pasek postępu w UI wisiałby po nieudanym imporcie/OCR.
    const withHandler = [
      'ocr.process-photo',
      'import.file.uploaded',
      'import.ksef-history.requested',
    ];
    const byQueue = new Map(registered.map((j) => [j.queue, j]));
    for (const q of withHandler) {
      expect(typeof byQueue.get(q)?.onExhausted, `brak onExhausted: ${q}`).toBe(
        'function',
      );
    }
  });

  it('paczka D: 9 jobów rdzenia KSeF', () => {
    const packageD = [
      'invoice.submit.requested',
      'invoice.upo.requested',
      'cron.upo-retry-stale',
      'cron.inbox-polling',
      'inbox.poll.tenant',
      'cron.process-offline-queue',
      'invoice.submit.succeeded.offline-queue',
      'invoice.submit.failed.offline-queue',
      'billing.payment.succeeded',
    ];
    expect(packageD.length).toBe(9);
    for (const q of packageD) expect(queues, `brak ${q}`).toContain(q);
  });

  it('submit-invoice: PEŁNY harmonogram KSeF 30s→2m→5m→15m→1h w rejestrze', () => {
    // Serce produktu. Zły harmonogram = zalewanie API Ministerstwa albo
    // faktury wiszące bez ponowienia.
    const submit = registered.find((j) => j.queue === 'invoice.submit.requested');
    expect(submit?.maxRetries).toBe(5);
    expect(typeof submit?.onExhausted, 'brak ścieżki Offline24').toBe('function');

    const expected = [30_000, 120_000, 300_000, 900_000, 3_600_000];
    for (let attempt = 0; attempt < expected.length; attempt++) {
      expect(submit?.getDelayMs?.(attempt), `próba ${attempt}`).toBe(
        expected[attempt],
      );
    }
  });

  it('limity per tenant/NIP w rdzeniu KSeF', () => {
    const byQueue = new Map(registered.map((j) => [j.queue, j]));
    expect(byQueue.get('invoice.submit.requested')?.groupConcurrency).toBe(100);
    expect(byQueue.get('invoice.upo.requested')?.groupConcurrency).toBe(3);
    expect(byQueue.get('inbox.poll.tenant')?.groupConcurrency).toBe(3);
    expect(byQueue.get('billing.payment.succeeded')?.groupConcurrency).toBe(1);
  });

  it('KOMPLET: 46 jobów z inwentaryzacji + kolejka smoke', () => {
    // Alarm, gdyby któraś paczka wypadła z importów workera.
    expect(registered.length).toBe(46);
  });

  it('parytet limitów równoległości paczki C', () => {
    const byQueue = new Map(registered.map((j) => [j.queue, j]));
    expect(byQueue.get('ocr.process-photo')?.batchSize).toBe(5);
    expect(byQueue.get('inbox.invoice.received')?.batchSize).toBe(10);
    expect(byQueue.get('validation.bulk-contractors.requested')?.batchSize).toBe(3);
    // magic-import: limit per NIP (grupa), nie globalny batch
    expect(byQueue.get('import.ksef-history.requested')?.groupConcurrency).toBe(3);
  });
});
