import {
  inngest,
  invoiceSubmitFailed,
  invoiceSubmitSucceeded,
} from '../client';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
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
import { createProposal } from '@/lib/flo/proposals';
import {
  buildKsefStatusProposal,
  evaluateSubmission,
} from '@/lib/flo/functions/ksef-status';
import { buildKsefFixProposal } from '@/lib/flo/functions/ksef-fix';

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

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runNotifySuccess(data: Parameters<typeof invoiceSubmitSucceeded.create>[0], { step, logger }: JobContext) {
    const { tenantId, invoiceId, ksefNumber } = data;

    // Karta agenta (X-01). Powiadomienie znika, karta zostaje — i mówi
    // prawdę o tym, czy poświadczenie odbioru już jest. Przy kontroli
    // różnica między „wysłałem" a „mam UPO" jest całą różnicą.
    await step.run('flo-status-card', async () => {
      const supabase = createAdminClient();
      const { data: invoice } = await supabase
        .from('invoices')
        .select('internal_number, ksef_status, updated_at')
        .eq('id', invoiceId)
        .maybeSingle();

      const { count } = await supabase
        .from('upo_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('invoice_id', invoiceId);

      const snapshot = {
        invoiceId,
        invoiceNumber: invoice?.internal_number ?? ksefNumber ?? 'bez numeru',
        state: 'accepted' as const,
        hasUpo: (count ?? 0) > 0,
        since: invoice?.updated_at ?? new Date().toISOString(),
        attempts: 1,
      };

      const proposal = buildKsefStatusProposal({
        tenantId,
        snapshot,
        verdict: evaluateSubmission(snapshot, new Date()),
      });
      if (proposal) await createProposal(proposal);
    });

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
}

export const notifySuccessJob = inngest.createFunction(
  {
    id: 'notify-invoice-success',
    name: 'Email: faktura zaakceptowana',
    retries: 2,
    triggers: [invoiceSubmitSucceeded],
  },
  async ({ event, step, logger, attempt }) =>
    runNotifySuccess(event.data as Parameters<typeof invoiceSubmitSucceeded.create>[0], toJobContext({ step, logger, attempt })),
);

// ═══════════════════════════════════════════════════════════════
// BŁĄD: faktura odrzucona lub retries wyczerpane
// ═══════════════════════════════════════════════════════════════

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runNotifyFailure(data: Parameters<typeof invoiceSubmitFailed.create>[0], { step, logger }: JobContext) {
    const { tenantId, invoiceId, error, fromOfflineQueue } = data;

    // Karta agenta (X-02). Tłumaczy odrzucenie i — gdy rozwiązanie jest
    // jedno — pokazuje gotową poprawkę z podglądem różnicy.
    await step.run('flo-fix-card', async () => {
      const supabase = createAdminClient();
      const { data: invoice } = await supabase
        .from('invoices')
        .select('internal_number, last_error_code')
        .eq('id', invoiceId)
        .maybeSingle();

      const { count } = await supabase
        .from('ksef_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('invoice_id', invoiceId);

      await createProposal(
        buildKsefFixProposal({
          tenantId,
          invoiceId,
          invoiceNumber: invoice?.internal_number ?? 'bez numeru',
          context: {
            code: String(invoice?.last_error_code ?? 'brak'),
            rawMessage: error,
            attempts: count ?? 1,
            // Kandydat na poprawkę wyliczy osobne zadanie; tutaj nie
            // zgadujemy, bo poprawka bez pewności jest gorsza od jej braku.
            candidate: undefined,
          },
        }),
      );
    });

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
}

export const notifyFailureJob = inngest.createFunction(
  {
    id: 'notify-invoice-failure',
    name: 'Email: faktura odrzucona',
    retries: 2,
    triggers: [invoiceSubmitFailed],
  },
  async ({ event, step, logger, attempt }) =>
    runNotifyFailure(event.data as Parameters<typeof invoiceSubmitFailed.create>[0], toJobContext({ step, logger, attempt })),
);
