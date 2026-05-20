import { serve } from 'inngest/next';

import { inngest } from '@/lib/inngest/client';
import { submitInvoiceJob } from '@/lib/inngest/jobs/submit-invoice';
import {
  inboxPollingJob,
  inboxPollTenantJob,
} from '@/lib/inngest/jobs/inbox-polling';
import { archiveOldInvoicesJob } from '@/lib/inngest/jobs/archive-old-invoices';
import { certExpiryAlertJob } from '@/lib/inngest/jobs/cert-expiry-alert';
import { retentionDeleteJob } from '@/lib/inngest/jobs/retention-delete';
import {
  notifyFailureJob,
  notifySuccessJob,
} from '@/lib/inngest/jobs/notify-user';
import { downloadUpoJob } from '@/lib/inngest/jobs/download-upo';
import {
  offlineQueueFailureHandler,
  offlineQueueSuccessHandler,
  processOfflineQueueJob,
} from '@/lib/inngest/jobs/process-offline-queue';
import { bulkImportFileJob } from '@/lib/inngest/jobs/bulk-import';
import { bulkValidateContractorsJob } from '@/lib/inngest/jobs/bulk-validate-contractors';
import { nightlyValidationRecheckJob } from '@/lib/inngest/jobs/nightly-validation-recheck';
import { magicImportKsefJob } from '@/lib/inngest/jobs/magic-import-ksef';
import { reminderSchedulerJob } from '@/lib/inngest/jobs/reminder-scheduler';
import { sendReminderJob } from '@/lib/inngest/jobs/send-reminder';
import { cancelRemindersOnPaymentJob } from '@/lib/inngest/jobs/cancel-reminders-on-payment';
import { exportsGenerateJob } from '@/lib/inngest/jobs/exports-generate';
import {
  coPilotMonthlyJob,
  coPilotSendPackageJob,
} from '@/lib/inngest/jobs/co-pilot-monthly';
import { jobsWatchdogJob } from '@/lib/inngest/jobs/jobs-watchdog';
import { refreshMaterializedViewsJob } from '@/lib/inngest/jobs/refresh-materialized-views';
import { cleanupAuditLogsJob } from '@/lib/inngest/jobs/cleanup-audit-logs';
import { ksefHealthCheckJob } from '@/lib/inngest/jobs/ksef-health-check';
import { upoRetryStaleJob } from '@/lib/inngest/jobs/upo-retry-stale';
import { selfInvoicePaymentJob } from '@/lib/inngest/jobs/self-invoice-payment';
import { trialCountdownEmailsJob } from '@/lib/inngest/jobs/trial-countdown-emails';
import { dunningPaymentFailedJob } from '@/lib/inngest/jobs/dunning-payment-failed';
import { processOcrJob } from '@/lib/inngest/jobs/process-ocr';
import { autoCategorizeInboxInvoice } from '@/lib/inngest/jobs/auto-categorize-inbox';
import {
  emailDay1,
  emailDay12,
  emailDay14,
  emailDay4,
  emailDay8,
  emailWelcome,
} from '@/lib/inngest/jobs/email-sequence';
import { gdprProcessDeletionsJob } from '@/lib/inngest/jobs/gdpr-process-deletions';
import { dailyDbSnapshotJob } from '@/lib/inngest/jobs/daily-db-snapshot';
import { verifyBackupJob } from '@/lib/inngest/jobs/verify-backup';
import { cleanupOldBackupsJob } from '@/lib/inngest/jobs/cleanup-old-backups';
import { dailyAnalyticsDigestJob } from '@/lib/inngest/jobs/daily-analytics-digest';
import { dailySummaryEmailJob } from '@/lib/inngest/jobs/daily-summary-email';
import { weeklyBusinessReviewJob } from '@/lib/inngest/jobs/weekly-business-review';
import { criticalAlertsMonitorJob } from '@/lib/inngest/jobs/critical-alerts-monitor';
/**
 * Webhook dla Inngest Cloud. Obsługuje GET, POST, PUT.
 * Na tym endpoincie Inngest sprawdza status, rejestruje funkcje
 * i dostarcza eventy do handlerów.
 *
 * Każda funkcja dodana tu musi być WYSTAWIONA - inaczej Inngest jej nie
 * zarejestruje i eventy będą cicho nie-obsługiwane (ani retry, ani alert).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    submitInvoiceJob,
    notifySuccessJob,
    notifyFailureJob,
    inboxPollingJob,
    inboxPollTenantJob,
    certExpiryAlertJob,
    archiveOldInvoicesJob,
    retentionDeleteJob,
    downloadUpoJob,
    processOfflineQueueJob,
    offlineQueueSuccessHandler,
    offlineQueueFailureHandler,
    magicImportKsefJob,
    bulkImportFileJob,
    bulkValidateContractorsJob,
    nightlyValidationRecheckJob,
    reminderSchedulerJob,
    sendReminderJob,
    cancelRemindersOnPaymentJob,
    exportsGenerateJob,
    coPilotMonthlyJob,
    coPilotSendPackageJob,
    jobsWatchdogJob,
    refreshMaterializedViewsJob,
    cleanupAuditLogsJob,
    ksefHealthCheckJob,
    upoRetryStaleJob,
    selfInvoicePaymentJob,
    trialCountdownEmailsJob,
    dunningPaymentFailedJob,
    processOcrJob,
    autoCategorizeInboxInvoice,
    emailWelcome,
    emailDay1,
    emailDay4,
    emailDay8,
    emailDay12,
    emailDay14,
    gdprProcessDeletionsJob,
    dailyDbSnapshotJob,
    verifyBackupJob,
    cleanupOldBackupsJob,
    dailyAnalyticsDigestJob,
    dailySummaryEmailJob,
    weeklyBusinessReviewJob,
    criticalAlertsMonitorJob,
  ],
});
