import {
  inngest,
  invoiceSubmitFailed,
  invoiceSubmitSucceeded,
} from '../client';
import {
  getTenantAdminEmail,
  getTenantOwnerUserId,
} from '@/lib/supabase/admin-queries';
import {
  sendInvoiceAcceptedEmail,
  sendInvoiceFailedEmail,
} from '@/lib/email/send';
import { sendPushToUser } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const result = await step.run('send-email', async () => {
      if (!email) {
        return {
          sent: false as const,
          reason: 'no-admin-email' as const,
        };
      }
      return sendInvoiceAcceptedEmail(email, { ksefNumber, invoiceId });
    });

    if (!email) {
      logger.warn('Brak email dla tenanta — email pominięty, push dalej próbujemy', {
        tenantId,
        invoiceId,
      });
    }

    const pushResult = await step.run('send-push', async () => {
      const ownerId = await getTenantOwnerUserId(tenantId);
      if (!ownerId) {
        return { skipped: true as const, reason: 'no-owner' as const };
      }

      const supabase = createAdminClient();
      const { data: inv } = await supabase
        .from('invoices')
        .select('internal_number')
        .eq('id', invoiceId)
        .maybeSingle();

      const label = inv?.internal_number?.trim()
        ? inv.internal_number
        : invoiceId.slice(0, 8);

      return sendPushToUser(ownerId, 'invoice_accepted', {
        title: '✅ Faktura zaakceptowana',
        body: `Faktura ${label} przeszła walidację KSeF`,
        url: `/invoices/${invoiceId}`,
        tag: `invoice-${invoiceId}`,
      });
    });

    logger.info('notify-success zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      pushResult,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason, push: pushResult };
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

    const result = await step.run('send-email', async () => {
      if (!email) {
        return {
          sent: false as const,
          reason: 'no-admin-email' as const,
        };
      }
      return sendInvoiceFailedEmail(email, { invoiceId, errorMessage: error });
    });

    if (!email) {
      logger.warn('Brak email dla tenanta — email pominięty, push dalej próbujemy', {
        tenantId,
        invoiceId,
      });
    }

    const pushResult = await step.run('send-push', async () => {
      const ownerId = await getTenantOwnerUserId(tenantId);
      if (!ownerId) {
        return { skipped: true as const, reason: 'no-owner' as const };
      }

      const supabase = createAdminClient();
      const { data: inv } = await supabase
        .from('invoices')
        .select('internal_number')
        .eq('id', invoiceId)
        .maybeSingle();

      const label = inv?.internal_number?.trim()
        ? inv.internal_number
        : invoiceId.slice(0, 8);
      const errShort =
        error.length > 140 ? `${error.slice(0, 137)}…` : error;

      return sendPushToUser(ownerId, 'invoice_rejected', {
        title: 'Faktura odrzucona przez KSeF',
        body: `${label}: ${errShort}`,
        url: `/invoices/${invoiceId}`,
        tag: `invoice-${invoiceId}`,
      });
    });

    logger.info('notify-failure zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      pushResult,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason, push: pushResult };
  },
);
