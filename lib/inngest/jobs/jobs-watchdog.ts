// lib/inngest/jobs/jobs-watchdog.ts
// Cron-watchdog nad asynchronicznymi jobami: szuka zawieszonych eksportów
// i niewysłanych przypomnień, wystawia alerty do Sentry.
//
// Audyt #28: bez tego watchdoga długie awarie Inngestu / Resend / R2 są
// niewidoczne dla operatora aż do reakcji użytkownika końcowego.
// Sentry message daje natychmiastową widoczność (Slack alert, dashboard).
//
// CELOWO NIE mutujemy stanu (nie oznaczamy jobów jako 'failed') —
// false-positive (job w trakcie wykonania, ale wolniejszy niż próg) nie
// powinien zatruwać kolejki. Operator dostaje alert i podejmuje decyzję.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Próg dla `export_jobs` — generowanie typowego eksportu (JPK_FA, KPiR Excel,
 * Comarch Optima) dla miesiąca to <60 s. 15 min to zdrowy SLO upper-bound;
 * powyżej tego coś realnie poszło nie tak (R2 5xx, KSeF API timeout, OOM).
 */
const STUCK_EXPORT_THRESHOLD_MINUTES = 15;

/**
 * Próg dla `payment_reminders` — `reminder-scheduler` chodzi co 15 min,
 * `send-reminder` ma retries: 3 z exp backoff (zazwyczaj <30 min na całość).
 * 1 godzina = już minęły wszystkie retry i mailing został pominięty.
 */
const STUCK_REMINDER_THRESHOLD_MINUTES = 60;

/**
 * Limit wierszy zwracanych z DB — chronimy się przed eksplozją alertów,
 * gdyby cała kolejka się zatkała. 50 to wystarczy do oceny skali; reszta
 * pokaże się przy następnym tickecie watchdoga.
 */
const MAX_ALERTS_PER_RUN = 50;

export const jobsWatchdogJob = inngest.createFunction(
  {
    id: 'jobs-watchdog',
    name: 'Watchdog: zawieszone joby (export + reminders)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw */15 * * * *')],
  },
  async ({ step, logger }) => {
    const supabase = createAdminClient();

    const stuckExports = await step.run('find-stuck-exports', async () => {
      const cutoff = new Date(
        Date.now() - STUCK_EXPORT_THRESHOLD_MINUTES * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from('export_jobs')
        .select('id, tenant_id, format, status, started_at, period_start, period_end')
        .eq('status', 'generating')
        .lt('started_at', cutoff)
        .order('started_at', { ascending: true })
        .limit(MAX_ALERTS_PER_RUN);

      if (error) throw new Error(`stuck-exports query: ${error.message}`);
      return data ?? [];
    });

    const stuckReminders = await step.run('find-stuck-reminders', async () => {
      const cutoff = new Date(
        Date.now() - STUCK_REMINDER_THRESHOLD_MINUTES * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from('payment_reminders')
        .select('id, tenant_id, invoice_id, stage, status, scheduled_for')
        .eq('status', 'pending')
        .lt('scheduled_for', cutoff)
        .order('scheduled_for', { ascending: true })
        .limit(MAX_ALERTS_PER_RUN);

      if (error) throw new Error(`stuck-reminders query: ${error.message}`);
      return data ?? [];
    });

    if (stuckExports.length === 0 && stuckReminders.length === 0) {
      logger.info('Watchdog: brak zawieszonych jobów');
      return {
        ok: true as const,
        stuckExports: 0,
        stuckReminders: 0,
      };
    }

    // Sentry events nie powinny lądować w step.run, bo inicjalizacja klienta
    // może być asynchroniczna a step.run memoizuje return-value (PII risk).
    // Wystarczy zwykły wywoływany sekwencyjnie await — i tak idziemy poza tę
    // funkcję jednorazowo.
    if (stuckExports.length > 0) {
      logger.error(`Watchdog: ${stuckExports.length} zawieszonych eksportów`);
      Sentry.captureMessage('jobs-watchdog: stuck export_jobs', {
        level: 'error',
        tags: {
          watchdog: 'export_jobs',
          count: String(stuckExports.length),
        },
        extra: {
          thresholdMinutes: STUCK_EXPORT_THRESHOLD_MINUTES,
          jobs: stuckExports.map((j) => ({
            id: j.id,
            tenantId: j.tenant_id,
            format: j.format,
            startedAt: j.started_at,
            period: `${j.period_start}…${j.period_end}`,
          })),
        },
      });
    }

    if (stuckReminders.length > 0) {
      logger.error(`Watchdog: ${stuckReminders.length} pendingowanych przypomnień`);
      Sentry.captureMessage('jobs-watchdog: stuck payment_reminders', {
        level: 'error',
        tags: {
          watchdog: 'payment_reminders',
          count: String(stuckReminders.length),
        },
        extra: {
          thresholdMinutes: STUCK_REMINDER_THRESHOLD_MINUTES,
          reminders: stuckReminders.map((r) => ({
            id: r.id,
            tenantId: r.tenant_id,
            invoiceId: r.invoice_id,
            stage: r.stage,
            scheduledFor: r.scheduled_for,
          })),
        },
      });
    }

    return {
      ok: true as const,
      stuckExports: stuckExports.length,
      stuckReminders: stuckReminders.length,
    };
  },
);
