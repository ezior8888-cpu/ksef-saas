/**
 * Rejestr kolejek pg-boss: mapa eventów Inngest → nazwy kolejek + definicje
 * cronów. JEDYNE źródło prawdy dla obu backendów w okresie przejściowym.
 *
 * Konwencja nazw: event 'invoice/submit.requested' → kolejka
 * 'invoice.submit.requested' (pg-boss preferuje [a-z0-9.-]).
 * Crony: kolejka 'cron.<id-joba-z-inngest>'.
 *
 * Test `tests/unit/jobs-queues.test.ts` pilnuje, żeby ta mapa nie
 * rozjechała się z eventami zdefiniowanymi w `lib/inngest/client.ts`.
 */

/** Wszystkie eventy domenowe + wewnętrzne sekwencji e-mail (stan: 17 sie 2026). */
export const EVENT_QUEUE_MAP = {
  'billing/payment.failed': 'billing.payment.failed',
  'billing/payment.succeeded': 'billing.payment.succeeded',
  'billing/subscription.canceled': 'billing.subscription.canceled',
  'email/trial-day-1': 'email.trial-day-1',
  'email/trial-day-4': 'email.trial-day-4',
  'email/trial-day-8': 'email.trial-day-8',
  'email/trial-day-12': 'email.trial-day-12',
  'email/trial-day-14': 'email.trial-day-14',
  'exports/co-pilot.send-package': 'exports.co-pilot.send-package',
  'exports/generate.requested': 'exports.generate.requested',
  'import/file.uploaded': 'import.file.uploaded',
  'import/ksef-history.requested': 'import.ksef-history.requested',
  'inbox/invoice-received': 'inbox.invoice-received',
  'inbox/invoice.received': 'inbox.invoice.received',
  'inbox/poll.tenant': 'inbox.poll.tenant',
  'invoice/payment.received': 'invoice.payment.received',
  'invoice/submit.failed': 'invoice.submit.failed',
  'invoice/submit.requested': 'invoice.submit.requested',
  'invoice/submit.succeeded': 'invoice.submit.succeeded',
  'invoice/upo.requested': 'invoice.upo.requested',
  'ocr/process-photo': 'ocr.process-photo',
  'reminders/send.requested': 'reminders.send.requested',
  'user/registered': 'user.registered',
  'validation/bulk-contractors.requested': 'validation.bulk-contractors.requested',
} as const;

export type KnownJobEvent = keyof typeof EVENT_QUEUE_MAP;

export function queueForEvent(eventName: string): string {
  const queue = EVENT_QUEUE_MAP[eventName as KnownJobEvent];
  if (!queue) {
    throw new Error(
      `Nieznany event jobowy: "${eventName}" — dodaj do EVENT_QUEUE_MAP w lib/jobs/queues.ts`,
    );
  }
  return queue;
}

export interface CronJobDef {
  /** Nazwa kolejki (= 'cron.' + id joba z Inngest). */
  queue: string;
  /** Wyrażenie cron (5 pól). */
  cron: string;
  /** Strefa czasowa (pg-boss: ScheduleOptions.tz). */
  tz?: string;
}

const TZ = 'Europe/Warsaw';

/** Wszystkie 22 crony z inwentaryzacji (17 sie 2026) — 1:1 z Inngest. */
export const CRON_JOBS: readonly CronJobDef[] = [
  { queue: 'cron.archive-old-invoices', cron: '0 3 * * *', tz: TZ },
  { queue: 'cron.cert-expiry-alert', cron: '0 8 * * *', tz: TZ },
  { queue: 'cron.cleanup-audit-logs', cron: '0 3 1 * *', tz: TZ },
  { queue: 'cron.cleanup-old-backups', cron: '0 4 * * *', tz: TZ },
  { queue: 'cron.co-pilot-monthly', cron: '0 8 * * *', tz: TZ },
  { queue: 'cron.critical-alerts-monitor', cron: '*/5 * * * *', tz: TZ },
  { queue: 'cron.daily-analytics-digest', cron: '0 6 * * *', tz: TZ },
  { queue: 'cron.daily-db-snapshot', cron: '0 2 * * *', tz: TZ },
  { queue: 'cron.daily-summary-email', cron: '0 6 * * *', tz: TZ },
  { queue: 'cron.gdpr-process-deletions', cron: '0 * * * *' },
  { queue: 'cron.inbox-polling', cron: '*/15 * * * *', tz: TZ },
  { queue: 'cron.jobs-watchdog', cron: '*/15 * * * *', tz: TZ },
  { queue: 'cron.ksef-health-check', cron: '* * * * *', tz: TZ },
  { queue: 'cron.nightly-validation-recheck', cron: '0 4 * * *', tz: TZ },
  { queue: 'cron.process-offline-queue', cron: '*/5 * * * *', tz: TZ },
  { queue: 'cron.refresh-materialized-views', cron: '0 * * * *', tz: TZ },
  { queue: 'cron.reminder-scheduler', cron: '0 * * * *', tz: TZ },
  { queue: 'cron.retention-delete', cron: '0 4 * * *', tz: TZ },
  { queue: 'cron.trial-countdown-emails', cron: '0 9 * * *', tz: TZ },
  { queue: 'cron.upo-retry-stale', cron: '5 * * * *', tz: TZ },
  { queue: 'cron.verify-backup', cron: '0 3 * * 0', tz: TZ },
  { queue: 'cron.weekly-business-review', cron: '0 9 * * 1', tz: TZ },
] as const;

/** Kolejka testowa smoke (Etap 1/2 — weryfikacja fundamentu i połączenia). */
export const SMOKE_QUEUE = 'jobs.smoke';
