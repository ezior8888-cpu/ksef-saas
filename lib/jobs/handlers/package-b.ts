/**
 * Paczka B (Etap 7.4): 17 jobów e-mail / billing / przypomnienia.
 *
 * Runnery żyją w lib/inngest/jobs/* (jedno źródło prawdy — Inngest woła je
 * przez adapter, worker pg-boss stąd).
 *
 * Parytet konfiguracji zachowany 1:1 z Inngest:
 *   - retries: notify 2, sekwencja e-mail 2, dunning 3, send-reminder 3,
 *     reszta default Inngest (4),
 *   - dunning: concurrency per tenant → grupa pg-boss `groupConcurrency: 1`
 *     (natywny odpowiednik `concurrency: { key: 'event.data.tenantId' }`).
 *
 * Sekwencja e-maili: odstępy dniowe realizuje `step.scheduleAfter`, które na
 * pg-boss zamienia się w `startAfter` (job czeka w tabeli, przeżywa restart),
 * a na Inngest w durable `sleep` — zachowanie identyczne na obu backendach.
 */

import { runCancelRemindersOnPayment } from '../../inngest/jobs/cancel-reminders-on-payment';
import { runCriticalAlertsMonitor } from '../../inngest/jobs/critical-alerts-monitor';
import { runDailyAnalyticsDigest } from '../../inngest/jobs/daily-analytics-digest';
import { runDailySummaryEmail } from '../../inngest/jobs/daily-summary-email';
import { runDunningPaymentFailed } from '../../inngest/jobs/dunning-payment-failed';
import {
  runEmailDay1,
  runEmailDay12,
  runEmailDay14,
  runEmailDay4,
  runEmailDay8,
  runEmailWelcome,
} from '../../inngest/jobs/email-sequence';
import { runNotifyFailure, runNotifySuccess } from '../../inngest/jobs/notify-user';
import { runReminderScheduler } from '../../inngest/jobs/reminder-scheduler';
import { runSendReminder } from '../../inngest/jobs/send-reminder';
import { runTrialCountdownEmails } from '../../inngest/jobs/trial-countdown-emails';
import { runWeeklyBusinessReview } from '../../inngest/jobs/weekly-business-review';
import { registerJob, type JobContext } from '../registry';

const INNGEST_DEFAULT_RETRIES = 4;

function cronJob(
  queue: string,
  runner: (ctx: JobContext) => Promise<unknown>,
  maxRetries: number = INNGEST_DEFAULT_RETRIES,
): void {
  registerJob<Record<string, never>>({
    queue,
    maxRetries,
    handler: (_data, ctx) => runner(ctx),
  });
}

function eventJob<TData>(
  queue: string,
  runner: (data: TData, ctx: JobContext) => Promise<unknown>,
  opts: { maxRetries?: number; groupConcurrency?: number } = {},
): void {
  registerJob<TData>({
    queue,
    maxRetries: opts.maxRetries ?? INNGEST_DEFAULT_RETRIES,
    ...(opts.groupConcurrency !== undefined
      ? { groupConcurrency: opts.groupConcurrency }
      : {}),
    handler: (data, ctx) => runner(data, ctx),
  });
}

// ── Crony ──
cronJob('cron.critical-alerts-monitor', runCriticalAlertsMonitor);
cronJob('cron.daily-analytics-digest', runDailyAnalyticsDigest);
cronJob('cron.daily-summary-email', runDailySummaryEmail);
cronJob('cron.reminder-scheduler', runReminderScheduler);
cronJob('cron.trial-countdown-emails', runTrialCountdownEmails);
cronJob('cron.weekly-business-review', runWeeklyBusinessReview);

// ── Powiadomienia o wyniku wysyłki faktury (retries 2 — lepiej nie wysłać
//    niż wysłać 4×; parytet z konfiguracją Inngest) ──
eventJob('invoice.submit.succeeded', runNotifySuccess, { maxRetries: 2 });
eventJob('invoice.submit.failed', runNotifyFailure, { maxRetries: 2 });

// ── Billing + przypomnienia ──
eventJob('billing.payment.failed', runDunningPaymentFailed, {
  maxRetries: 3,
  groupConcurrency: 1, // odpowiednik concurrency per tenantId
});
eventJob('reminders.send.requested', runSendReminder, { maxRetries: 3 });
eventJob('invoice.payment.received', runCancelRemindersOnPayment);

// ── Sekwencja onboardingowa (14 dni, łańcuch przez scheduleAfter) ──
eventJob('user.registered', runEmailWelcome, { maxRetries: 2 });
eventJob('email.trial-day-1', runEmailDay1, { maxRetries: 2 });
eventJob('email.trial-day-4', runEmailDay4, { maxRetries: 2 });
eventJob('email.trial-day-8', runEmailDay8, { maxRetries: 2 });
eventJob('email.trial-day-12', runEmailDay12, { maxRetries: 2 });
eventJob('email.trial-day-14', runEmailDay14, { maxRetries: 2 });
