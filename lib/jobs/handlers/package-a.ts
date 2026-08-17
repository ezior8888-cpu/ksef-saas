/**
 * Paczka A (Etap 7.3): 12 cronów utrzymaniowych — rejestracje pg-boss.
 *
 * Runnery żyją w lib/inngest/jobs/* (jedno źródło prawdy — Inngest woła je
 * przez adapter, worker pg-boss stąd). Kolejki cron.* są planowane przez
 * worker wg CRON_JOBS z lib/jobs/queues.ts (1:1 z triggerami Inngest).
 *
 * Parytet retries: Inngest default = 4 ponowne próby; wyjątek
 * nightly-validation-recheck (retries: 1 w konfiguracji joba).
 */

import { runArchiveOldInvoices } from '../../inngest/jobs/archive-old-invoices';
import { runCertExpiryAlert } from '../../inngest/jobs/cert-expiry-alert';
import { runCleanupAuditLogs } from '../../inngest/jobs/cleanup-audit-logs';
import { runCleanupOldBackups } from '../../inngest/jobs/cleanup-old-backups';
import { runDailyDbSnapshot } from '../../inngest/jobs/daily-db-snapshot';
import { runGdprProcessDeletions } from '../../inngest/jobs/gdpr-process-deletions';
import { runJobsWatchdog } from '../../inngest/jobs/jobs-watchdog';
import { runKsefHealthCheck } from '../../inngest/jobs/ksef-health-check';
import { runNightlyValidationRecheck } from '../../inngest/jobs/nightly-validation-recheck';
import { runRefreshMaterializedViews } from '../../inngest/jobs/refresh-materialized-views';
import { runRetentionDelete } from '../../inngest/jobs/retention-delete';
import { runVerifyBackup } from '../../inngest/jobs/verify-backup';
import { registerJob, type JobContext } from '../registry';

const INNGEST_DEFAULT_RETRIES = 4;

/** Cron bez payloadu — handler ignoruje dane, odpala runner z kontekstem. */
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

cronJob('cron.archive-old-invoices', runArchiveOldInvoices);
cronJob('cron.cert-expiry-alert', runCertExpiryAlert);
cronJob('cron.cleanup-audit-logs', runCleanupAuditLogs);
cronJob('cron.cleanup-old-backups', runCleanupOldBackups);
cronJob('cron.daily-db-snapshot', runDailyDbSnapshot);
cronJob('cron.gdpr-process-deletions', runGdprProcessDeletions);
cronJob('cron.jobs-watchdog', runJobsWatchdog);
cronJob('cron.ksef-health-check', runKsefHealthCheck);
cronJob(
  'cron.nightly-validation-recheck',
  runNightlyValidationRecheck,
  1, // parytet: retries: 1 w konfiguracji Inngest tego joba
);
cronJob('cron.refresh-materialized-views', runRefreshMaterializedViews);
cronJob('cron.retention-delete', runRetentionDelete);
cronJob('cron.verify-backup', runVerifyBackup);
