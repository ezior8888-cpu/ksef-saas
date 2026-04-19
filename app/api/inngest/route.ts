import { serve } from 'inngest/next';

import { inngest } from '@/lib/inngest/client';
import { submitInvoiceJob } from '@/lib/inngest/jobs/submit-invoice';
import {
  inboxPollingJob,
  inboxPollTenantJob,
} from '@/lib/inngest/jobs/inbox-polling';
import { certExpiryAlertJob } from '@/lib/inngest/jobs/cert-expiry-alert';
import {
  notifyFailureJob,
  notifySuccessJob,
} from '@/lib/inngest/jobs/notify-user';

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
  ],
});
