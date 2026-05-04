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
  ],
});
