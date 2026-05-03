import {
  inngest,
  invoiceSubmitFailed,
  invoiceSubmitSucceeded,
} from '../client';
import { getTenantAdminEmail } from '@/lib/supabase/admin-queries';
import {
  sendInvoiceAcceptedEmail,
  sendInvoiceFailedEmail,
} from '@/lib/email/send';

/**
 * Notyfikacje per-użytkownik po zakończeniu wysyłki faktury.
 *
 * Oddzielone od `submitInvoiceJob` świadomie:
 *   - single-responsibility: submit robi KSeF, ten robi komunikację
 *   - niezależny retry: padnie Resend 503? Nie cofamy już wysłanej faktury
 *   - łatwo dołożyć kolejne kanały (Slack, push, in-app toast) jako nowe
 *     listenery tych samych eventów
 *
 * retries=2 bo email lepiej nie dostarczyć niż wysłać 4 razy.
 */

// ═══════════════════════════════════════════════════════════════
// SUKCES: faktura zaakceptowana przez KSeF
// ═══════════════════════════════════════════════════════════════

export const notifySuccessJob = inngest.createFunction(
  {
    id: 'notify-invoice-success',
    name: 'Email: faktura zaakceptowana',
    retries: 2,
    triggers: [invoiceSubmitSucceeded],
  },
  async ({ event, step, logger }) => {
    const { tenantId, invoiceId, ksefNumber } = event.data;

    const email = await step.run('get-admin-email', () =>
      getTenantAdminEmail(tenantId),
    );

    if (!email) {
      logger.warn('Brak email dla tenanta - pomijam powiadomienie', {
        tenantId,
        invoiceId,
      });
      return { skipped: true as const, reason: 'no-admin-email' };
    }

    const result = await step.run('send-email', () =>
      sendInvoiceAcceptedEmail(email, { ksefNumber, invoiceId }),
    );

    logger.info('notify-success zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason };
  },
);

// ═══════════════════════════════════════════════════════════════
// BŁĄD: faktura odrzucona lub retries wyczerpane
// ═══════════════════════════════════════════════════════════════

export const notifyFailureJob = inngest.createFunction(
  {
    id: 'notify-invoice-failure',
    name: 'Email: faktura odrzucona',
    retries: 2,
    triggers: [invoiceSubmitFailed],
  },
  async ({ event, step, logger }) => {
    const { tenantId, invoiceId, error, fromOfflineQueue } = event.data;

    if (fromOfflineQueue) {
      logger.info(
        'Pomijam email o błędzie — faktura z kolejki Offline24 wraca do kolejki',
        { tenantId, invoiceId },
      );
      return {
        skipped: true as const,
        reason: 'offline-queue-retry' as const,
      };
    }

    const email = await step.run('get-admin-email', () =>
      getTenantAdminEmail(tenantId),
    );

    if (!email) {
      logger.warn('Brak email dla tenanta - pomijam powiadomienie', {
        tenantId,
        invoiceId,
      });
      return { skipped: true as const, reason: 'no-admin-email' };
    }

    const result = await step.run('send-email', () =>
      sendInvoiceFailedEmail(email, { invoiceId, errorMessage: error }),
    );

    logger.info('notify-failure zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason };
  },
);
