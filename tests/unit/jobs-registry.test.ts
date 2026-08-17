/**
 * Testy rejestru handlerów (Etap 7, paczki A-B).
 *
 * Cel: wyłapać rozjazd między zarejestrowanymi kolejkami a mapą
 * `lib/jobs/queues.ts` ZANIM worker wystartuje na produkcji — literówka
 * w nazwie kolejki oznaczałaby cicho nieobsługiwany job.
 */

import { describe, expect, it } from 'vitest';

import { CRON_JOBS, EVENT_QUEUE_MAP } from '@/lib/jobs/queues';
import { getRegisteredJobs } from '@/lib/jobs/registry';

// Side-effect: rejestracje paczek.
import '@/lib/jobs/handlers/package-a';
import '@/lib/jobs/handlers/package-b';
import '@/lib/jobs/handlers/package-c';

const registered = getRegisteredJobs();
const queues = registered.map((j) => j.queue);

describe('rejestr jobów', () => {
  it('nie ma duplikatów kolejek', () => {
    expect(new Set(queues).size).toBe(queues.length);
  });

  it('każda zarejestrowana kolejka istnieje w queues.ts', () => {
    const known = new Set<string>([
      ...CRON_JOBS.map((c) => c.queue),
      ...Object.values(EVENT_QUEUE_MAP),
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
      'invoice.submit.succeeded',
      'invoice.submit.failed',
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
    expect(byQueue.get('invoice.submit.succeeded')?.maxRetries).toBe(2);
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

  it('parytet limitów równoległości paczki C', () => {
    const byQueue = new Map(registered.map((j) => [j.queue, j]));
    expect(byQueue.get('ocr.process-photo')?.batchSize).toBe(5);
    expect(byQueue.get('inbox.invoice.received')?.batchSize).toBe(10);
    expect(byQueue.get('validation.bulk-contractors.requested')?.batchSize).toBe(3);
    // magic-import: limit per NIP (grupa), nie globalny batch
    expect(byQueue.get('import.ksef-history.requested')?.groupConcurrency).toBe(3);
  });
});
