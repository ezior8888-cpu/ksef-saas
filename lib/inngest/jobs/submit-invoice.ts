import * as Sentry from '@sentry/nextjs';
import { NonRetriableError } from 'inngest';
import { logAuditSystem } from '@/lib/audit/log-system';
import { inngest, invoiceSubmitRequested } from '../client';
import { submitInvoiceFullFlow } from '@/lib/ksef/submit-invoice-full';
import {
  getTenantKsefCredentials,
  updateInvoiceStatus,
} from '@/lib/supabase/admin-queries';
import { KsefApiError } from '@/lib/ksef/client';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import { InvoiceValidationError } from '@/lib/xml/fa3-generator';
import type {
  CorrectionInvoiceData,
  AdvanceInvoiceData,
  FinalInvoiceData,
} from '@/types/invoice-types';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';

/**
 * Job wysyłki faktury do KSeF.
 *
 * Trigger: event 'invoice/submit.requested' (publikowany z Server Action
 * po kliknięciu "Wyślij do KSeF" w UI).
 *
 * Retry policy:
 * - Błędy retry-owalne (network, 5xx, 429 rate limit): automatyczny retry
 *   z exponential backoff (Inngest: 4 próby).
 * - Błędy nieretry-owalne (walidacja FA(3), 400 Bad Request, 403): owijamy
 *   w NonRetriableError - job kończy się natychmiast, faktura dostaje
 *   status 'rejected' z opisem błędu.
 */
export const submitInvoiceJob = inngest.createFunction(
  {
    id: 'submit-invoice-to-ksef',
    name: 'Wysyłka faktury do KSeF',
    retries: 4,
    // Concurrency per NIP - nie wysyłamy 100 faktur tego samego tenanta
    // równolegle (limit otwartych sesji KSeF + własny rate-limiter po stronie
    // klienta). `key` to CEL expression - 'event.data.nip' wybiera pole
    // z payloadu eventu.
    concurrency: {
      key: 'event.data.nip',
      limit: 3,
    },
    triggers: [invoiceSubmitRequested],

    // Handler wywoływany PO wyczerpaniu wszystkich retries (lub NonRetriableError).
    // Inngest wewnętrznie robi z tego osobną funkcję na evencie
    // `inngest/function.failed` - pojawi się w UI jako
    // "Wysyłka faktury do KSeF (failure)".
    //
    // UWAGA: `error` jest zserializowany przez JSON (cross-process), więc:
    //   - `instanceof NonRetriableError` NIE działa
    //   - używaj `error.name === 'NonRetriableError'` jako dyskryminatora
    onFailure: async ({ error, event, step, logger }) => {
      // event.data.event = oryginalny `invoice/submit.requested`
      const originalEvent = event.data.event as {
        data: {
          tenantId: string;
          invoiceId: string;
          nip: string;
          invoice: { internalNumber: string };
          fromOfflineQueue?: boolean;
        };
      };

      const { tenantId, invoiceId, nip, invoice } = originalEvent.data;
      const fromOfflineQueue = Boolean(originalEvent.data.fromOfflineQueue);

      const isBusinessRejection = error.name === 'NonRetriableError';
      const finalStatus: 'rejected' | 'failed' = isBusinessRejection
        ? 'rejected'
        : 'failed';

      logger.error('Job wysyłki padł - oznaczam fakturę w DB', {
        tenantId,
        invoiceId,
        nip,
        internalNumber: invoice.internalNumber,
        errorName: error.name,
        errorMessage: error.message,
        finalStatus,
        fromOfflineQueue,
      });

      if (!fromOfflineQueue) {
        await step.run('mark-as-failed', async () => {
          await updateInvoiceStatus(invoiceId, {
            ksef_status: finalStatus,
            last_error: `${error.name}: ${error.message}`,
            last_error_code: null,
            last_error_field: null,
            last_error_suggestion: null,
          });
        });

        await step.run('audit-submit-failed', async () => {
          await logAuditSystem({
            action: 'invoice.submit_failed',
            tenantId,
            userId: null,
            entityType: 'invoice',
            entityId: invoiceId,
            metadata: {
              internalNumber: invoice.internalNumber,
              finalStatus,
              error: `${error.name}: ${error.message}`,
            },
          });
        });
      }

      await step.sendEvent('emit-failure', {
        name: 'invoice/submit.failed',
        data: {
          invoiceId,
          tenantId,
          error: `${error.name}: ${error.message}`,
          fromOfflineQueue: originalEvent.data.fromOfflineQueue,
        },
      });

      return { handled: true, finalStatus, fromOfflineQueue };
    },
  },
  async ({ event, step, logger }) => {
    const { tenantId, invoiceId, invoice, nip } = event.data;
    const env = (process.env.KSEF_ENV as 'test' | 'demo' | 'production') ?? 'test';
    const fromOfflineQueue = Boolean(event.data.fromOfflineQueue);

    logger.info('Rozpoczynam wysyłkę faktury', {
      tenantId,
      invoiceId,
      nip,
      internalNumber: invoice.internalNumber,
      fromOfflineQueue,
    });

    // Re-emisja po odebraniu z kolejki offline — nie blokuj kolejnym probingiem `/health`,
    // tylko idź klasyczną ścieżką online submit.
    if (!fromOfflineQueue) {
      const health = await step.run('check-ksef-health', async () =>
        shouldUseOfflineMode(env),
      );

      if (health.offline) {
        const redirected = await step.run(
          'try-redirect-offline-queue',
          async (): Promise<boolean> => {
            const creds = await getTenantKsefCredentials(tenantId);
            if (creds.type !== 'xades') {
              logger.warn('KSeF offline — pomijam kolejkę offline (brak PEM / token)', {
                tenantId,
                invoiceId,
                authType: creds.type,
              });
              return false;
            }

            await addToOfflineQueue({
              tenantId,
              invoiceId,
              isMfOutage: health.isMfOutage,
              certificate: creds.certificatePem,
            });
            return true;
          },
        );

        if (redirected) {
          await step.run('audit-redirect-offline', async () => {
            await logAuditSystem({
              action: 'invoice.submit_redirected_offline',
              tenantId,
              entityType: 'invoice',
              entityId: invoiceId,
              metadata: {
                reason: health.reason,
                isMfOutage: health.isMfOutage,
                internalNumber: invoice.internalNumber,
              },
            });
          });

          logger.info('KSeF niedostępny — faktura przekierowana do trybu Offline24', {
            invoiceId,
            reason: health.reason,
          });

          return {
            redirected: 'offline',
            reason: health.reason,
            isMfOutage: health.isMfOutage,
          };
        }
      }
    }

    // Krok 1: credentials PRZED `sending` — jeśli brak certyfikatu / decrypt
    // padnie (NonRetriableError), `onFailure` oznaczy fakturę jako `rejected`
    // zanim status przejdzie na `sending`. Wcześniej UI ma zwykle `queued`.
    const credentials = await step.run('load-credentials', async () => {
      try {
        return await getTenantKsefCredentials(tenantId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new NonRetriableError(
          `Nie można użyć credentials KSeF: ${msg}`,
          { cause: e },
        );
      }
    });

    // Krok 2: status 'sending' + timestamp — dopiero gdy wiemy, że job może
    // realnie pogadać z KSeF.
    await step.run('mark-as-sending', async () => {
      const now = new Date().toISOString();
      await updateInvoiceStatus(invoiceId, {
        ksef_status: 'sending',
        submitted_to_ksef_at: now,
        last_attempt_at: now,
      });
    });

    await step.run('audit-start', async () => {
      await logAuditSystem({
        action: 'invoice.submit_requested',
        tenantId,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { attempt: 1 },
      });
    });

    // Krok 3: pełny flow (generuj XML → waliduj XSD → R2 → KSeF).
    // Ten step ma własny retry - błąd sieciowy retryuje TYLKO ten step,
    // nie wcześniejszych (status w DB już 'sending', credentials w pamięci).
    const result = await step.run('submit-to-ksef', async () => {
      try {
        const ed = event.data as {
          correctionData?: CorrectionInvoiceData;
          advanceData?: AdvanceInvoiceData;
          finalData?: FinalInvoiceData;
          finalAdvanceSettlementRows?: AdvanceInvoiceSettlementRow[];
        };

        const finalPayload =
          ed.finalData &&
          ed.finalAdvanceSettlementRows &&
          ed.finalAdvanceSettlementRows.length > 0
            ? {
                finalData: ed.finalData,
                advanceSettlementRows: ed.finalAdvanceSettlementRows,
              }
            : null;

        return await submitInvoiceFullFlow(
          tenantId,
          invoiceId,
          invoice,
          credentials,
          env,
          ed.correctionData ?? null,
          ed.advanceData ?? null,
          finalPayload,
        );
      } catch (error) {
        // Nie-retry-owalne: walidacja biznesowa i odrzucenie przez KSeF.
        // Bez NonRetriableError Inngest zrobiłby 4 bezsensowne próby.
        if (error instanceof InvoiceValidationError) {
          throw new NonRetriableError(
            `Faktura nie przeszła walidacji: ${error.message}`,
            { cause: error },
          );
        }
        if (error instanceof KsefApiError && !error.isRetryable) {
          Sentry.captureException(error, {
            tags: { job: 'submit-invoice', kind: 'ksef-rejection' },
            extra: { tenantId, invoiceId, ksefCode: error.ksefCode },
          });
          throw new NonRetriableError(
            `KSeF odrzucił fakturę: ${error.message}`,
            { cause: error },
          );
        }
        // Pozostałe (5xx, timeout, ECONNRESET) - niech Inngest retryuje.
        throw error;
      }
    });

    // Krok 4: zapisz numer KSeF i timestamp akceptacji do bazy.
    await step.run('save-ksef-number', async () => {
      await updateInvoiceStatus(invoiceId, {
        ksef_status: 'accepted',
        ksef_number: result.ksefNumber,
        ksef_accepted_at: result.acquisitionTimestamp,
        xml_storage_path: result.xmlStoragePath,
        last_error: null,
        last_error_code: null,
        last_error_field: null,
        last_error_suggestion: null,
      });
    });

    await step.sendEvent('trigger-upo-download', {
      name: 'invoice/upo.requested',
      data: {
        invoiceId,
        tenantId,
        ksefNumber: result.ksefNumber,
      },
    });

    await step.run('audit-success', async () => {
      await logAuditSystem({
        action: 'invoice.submit_succeeded',
        tenantId,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { ksefNumber: result.ksefNumber },
      });
    });

    await step.sendEvent('emit-success', {
      name: 'invoice/submit.succeeded',
      data: {
        invoiceId,
        tenantId,
        ksefNumber: result.ksefNumber,
        fromOfflineQueue: event.data.fromOfflineQueue,
      },
    });

    logger.info('Faktura wysłana', {
      invoiceId,
      ksefNumber: result.ksefNumber,
    });

    return {
      success: true,
      ksefNumber: result.ksefNumber,
    };
  },
);
