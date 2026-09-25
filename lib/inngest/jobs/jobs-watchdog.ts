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
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import { createAdminClient } from '@/lib/supabase/admin';
import { floDb } from '@/lib/flo/db-types';

/**
 * Próg dla `export_jobs` — generowanie typowego eksportu (JPK_FA, KPiR Excel,
 * Comarch Optima) dla miesiąca to <60 s. 15 min to zdrowy SLO upper-bound;
 * powyżej tego coś realnie poszło nie tak (R2 5xx, KSeF API timeout, OOM).
 */
const STUCK_EXPORT_THRESHOLD_MINUTES = 15;

/**
 * Nowa zgoda na wysyłkę trwa najwyżej 30 minut od jej utworzenia (często
 * krócej). Po tym czasie brak potwierdzenia Resend wymaga ręcznego rozliczenia,
 * a ponowienie maila jest blokowane. Cron co 15 minut wykrywa przypadek
 * po około 30–45 minutach od zaplanowania.
 */
const STUCK_REMINDER_THRESHOLD_MINUTES = 30;

/**
 * Limit szczegółów w alercie — chronimy się przed eksplozją danych.
 * Starsze pending mogą trwale zajmować te same 50 miejsc, dlatego osobno
 * liczymy całą pulę i jawnie oznaczamy obcięcie.
 */
const MAX_ALERTS_PER_RUN = 50;

type ReminderRecoveryState =
  | 'receipt_marker_recorded'
  | 'dispatch_without_receipt'
  | 'missing_dispatch_or_legacy'
  | 'approval_lookup_unavailable';

/** Read only approval IDs and JSON marker presence. The snapshot can contain
 * the full email and PDF, so neither it nor database errors enter Sentry. */
async function classifyPendingReminders(ids: string[]): Promise<Record<string, ReminderRecoveryState>> {
  // Durable steps persist JSON; Map would deserialize as an empty object.
  const result: Record<string, ReminderRecoveryState> = {};
  if (ids.length === 0) return result;
  const db = floDb();
  const [approvals, missingDispatch, missingReceipt] = await Promise.all([
    db.from('flo_approvals').select('id').in('id', ids),
    db.from('flo_approvals').select('id').in('id', ids).is('snapshot->>reminderDispatch', null),
    db.from('flo_approvals').select('id').in('id', ids).is('snapshot->>reminderReceipt', null),
  ]);
  if (approvals.error || missingDispatch.error || missingReceipt.error ||
      !approvals.data || !missingDispatch.data || !missingReceipt.data) {
    for (const id of ids) result[id] = 'approval_lookup_unavailable';
    return result;
  }
  const present = new Set(approvals.data.map((row) => row.id));
  const noDispatch = new Set(missingDispatch.data.map((row) => row.id));
  const noReceipt = new Set(missingReceipt.data.map((row) => row.id));
  for (const id of ids) {
    result[id] = !present.has(id) || noDispatch.has(id) ? 'missing_dispatch_or_legacy'
      : noReceipt.has(id) ? 'dispatch_without_receipt' : 'receipt_marker_recorded';
  }
  return result;
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.jobs-watchdog).
 */
export async function runJobsWatchdog({ step, logger }: JobContext) {
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

    const reminderScan = await step.run('find-stuck-reminders-v2', async () => {
      const cutoff = new Date(
        Date.now() - STUCK_REMINDER_THRESHOLD_MINUTES * 60 * 1000,
      ).toISOString();

      const { data, error, count } = await supabase
        .from('payment_reminders')
        .select('id, stage, scheduled_for', { count: 'exact' })
        .eq('status', 'pending')
        .lt('scheduled_for', cutoff)
        .order('scheduled_for', { ascending: true })
        .limit(MAX_ALERTS_PER_RUN);

      if (error) throw new Error('stuck-reminders query unavailable');
      const rows = data ?? [];
      const countVerified = Number.isInteger(count) && count !== null && count >= rows.length;
      return { rows, total: countVerified ? count : null, countVerified,
        truncated: !countVerified || count > rows.length };
    });
    const stuckReminders = reminderScan.rows;

    const reminderRecovery = await step.run('classify-stuck-reminders', () =>
      classifyPendingReminders(stuckReminders.map((reminder) => reminder.id)));

    if (stuckExports.length === 0 && reminderScan.total === 0) {
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

    if (reminderScan.total !== 0) {
      logger.error(reminderScan.countVerified
        ? `Watchdog: ${reminderScan.total} pendingowanych przypomnień wymaga weryfikacji`
        : 'Watchdog: nie można potwierdzić liczby oczekujących przypomnień');
      Sentry.captureMessage('jobs-watchdog: stuck payment_reminders', {
        level: 'error',
        tags: {
          watchdog: 'payment_reminders',
          count: reminderScan.total === null ? 'unknown' : String(reminderScan.total),
          countVerified: String(reminderScan.countVerified),
          truncated: String(reminderScan.truncated),
        },
        extra: {
          thresholdMinutes: STUCK_REMINDER_THRESHOLD_MINUTES,
          totalPending: reminderScan.total,
          shown: stuckReminders.length,
          truncated: reminderScan.truncated,
          reminders: stuckReminders.map((r) => ({
            id: r.id,
            stage: r.stage,
            scheduledFor: r.scheduled_for,
            recoveryState: reminderRecovery[r.id] ?? 'approval_lookup_unavailable',
          })),
        },
      });
    }

    return {
      ok: true as const,
      stuckExports: stuckExports.length,
      stuckReminders: reminderScan.total ?? stuckReminders.length,
    };
}

export const jobsWatchdogJob = inngest.createFunction(
  {
    id: 'jobs-watchdog',
    name: 'Watchdog: zawieszone joby (export + reminders)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw */15 * * * *')],
  },
  async ({ step, logger, attempt }) =>
    runJobsWatchdog(toJobContext({ step, logger, attempt })),
);
