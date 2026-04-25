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
import { InvoiceValidationError } from '@/lib/xml/fa3-generator';

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
        };
      };

      const { tenantId, invoiceId, nip, invoice } = originalEvent.data;

      // Rozróżnienie:
      //   - NonRetriableError → KSeF/XSD świadomie odrzucił (wina danych) → 'rejected'
      //   - inne błędy → infrastruktura wyczerpała retries → 'failed'
      //
      // Semantyka statusów:
      //   'rejected' = user musi poprawić fakturę (walidacja/400)
      //   'failed'   = user może spróbować ponownie bez zmian (network/5xx/timeout)
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
      });

      await step.run('mark-as-failed', async () => {
        await updateInvoiceStatus(invoiceId, {
          ksef_status: finalStatus,
          last_error: `${error.name}: ${error.message}`,
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

      // Publikujemy event żeby notify-submit-failed mógł wysłać emaila / Slacka.
      // Osobny job trzyma handler od DB update - separation of concerns.
      await step.sendEvent('publish-failure', {
        name: 'invoice/submit.failed',
        data: {
          tenantId,
          invoiceId,
          errorMessage: `${error.name}: ${error.message}`,
        },
      });

      return { handled: true, finalStatus };
    },
  },
  async ({ event, step, logger }) => {
    const { tenantId, invoiceId, invoice, nip } = event.data;

    logger.info('Rozpoczynam wysyłkę faktury', {
      tenantId,
      invoiceId,
      nip,
      internalNumber: invoice.internalNumber,
    });

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
        return await submitInvoiceFullFlow(
          tenantId,
          invoiceId,
          invoice,
          credentials,
          (process.env.KSEF_ENV as 'test' | 'demo' | 'production') ?? 'test',
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
      });
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

    // Krok 5: publikuj sukces - osobny handler wyśle email przez Resend.
    await step.sendEvent('publish-success', {
      name: 'invoice/submit.succeeded',
      data: {
        tenantId,
        invoiceId,
        ksefNumber: result.ksefNumber,
        xmlStoragePath: result.xmlStoragePath,
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
