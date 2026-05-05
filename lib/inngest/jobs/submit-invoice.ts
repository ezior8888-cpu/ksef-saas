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
    // Runtime walidacja Zod — bramka między event store a transakcją KSeF.
    // Zła paczka (np. brak NIP-u po replay'u eventu ze starego kodu) zostaje
    // odrzucona PRZED jakąkolwiek operacją w DB / R2 / KSeF. NonRetriableError
    // zatrzymuje retry i woła `onFailure`, który oznacza fakturę jako rejected.
    const parsed = invoiceSubmitRequested.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `Niepoprawny payload eventu invoice/submit.requested: ${parsed.error.message}`,
        { cause: parsed.error },
      );
    }
    const { tenantId, invoiceId, invoice, nip } = parsed.data;
    const env = (process.env.KSEF_ENV as 'test' | 'demo' | 'production') ?? 'test';
    const fromOfflineQueue = Boolean(parsed.data.fromOfflineQueue);

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

    // Krok 1: walidacja credentials PRZED `sending` — jeśli brak certyfikatu /
    // decrypt padnie (NonRetriableError), `onFailure` oznaczy fakturę jako
    // `rejected` zanim status przejdzie na `sending`.
    //
    // UWAGA SECOPS: ten step CELOWO zwraca tylko `{ type, nip }` zamiast
    // pełnych credentials. Inngest serializuje return-value każdego `step.run`
    // do swojego event store'u (memoization na potrzeby retry) — gdybyśmy
    // wracali pełny `KsefAuth`, odszyfrowany PEM klucza prywatnego XAdES /
    // long-lived token KSeF lądował-by w cudzej bazie z retencją >1d.
    // Faktyczne credentials wczytujemy ponownie wewnątrz kroku `submit-to-ksef`
    // (świeży decrypt z naszej DB, bez serializacji do Inngest).
    await step.run('load-credentials-meta', async () => {
      try {
        const c = await getTenantKsefCredentials(tenantId);
        return { type: c.type, nip: c.nip };
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
    // Credentials wczytujemy świeżo wewnątrz tego step.run — return value
    // tego stepu jest stripowany przez `submitInvoiceFullFlow` do meta-danych
    // wyniku (ksefNumber, hash, path), więc nic wrażliwego nie wycieka do
    // Inngest store'u.
    //
    // Ten step ma własny retry — błąd sieciowy retryuje TYLKO jego, nie
    // wcześniejszych (status w DB już 'sending'). Przy retry credentials
    // wczytamy ponownie z DB — koszt: jeden dodatkowy SELECT + decrypt,
    // zysk: brak wycieku PEM-a do zewnętrznego storage'u.
    const result = await step.run('submit-to-ksef', async () => {
      const credentials = await getTenantKsefCredentials(tenantId);

      try {
        // Po refaktorze na zodEvent korzystamy z `parsed.data` (zwalidowanego),
        // a nie z surowego `event.data` — typy są pewne, bez `as` casta.
        const finalPayload =
          parsed.data.finalData &&
          parsed.data.finalAdvanceSettlementRows &&
          parsed.data.finalAdvanceSettlementRows.length > 0
            ? {
                finalData: parsed.data.finalData,
                advanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
              }
            : null;

        return await submitInvoiceFullFlow(
          tenantId,
          invoiceId,
          invoice,
          credentials,
          env,
          parsed.data.correctionData ?? null,
          parsed.data.advanceData ?? null,
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
        // `nip` powędruje do `downloadUpoJob` jako klucz concurrency
        // (`{ key: 'event.data.nip', limit: 3 }`) — limit per-tenant zapobiega
        // zalaniu KSeF /upo żądaniami z jednego podmiotu.
        nip,
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
