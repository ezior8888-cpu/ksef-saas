import { assertJobIdentity, requireInvoiceTenant } from './tenant-boundary';
import * as Sentry from '@sentry/nextjs';
import { NonRetriableError, RetryAfterError } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { logAuditSystem } from '@/lib/audit/log-system';
import { inngest, invoiceSubmitRequested } from '../client';
import { submitInvoiceFullFlow } from '@/lib/ksef/submit-invoice-full';
import { assertSubmitReferences } from '@/lib/ksef/submit-reference-boundary';
import {
  KsefNotVerifiedError,
  requireKsefVerificationForBackgroundJob,
} from '@/lib/auth/ksef-verification-guard';
import {
  claimInvoiceForKsefSend,
  getTenantKsefCredentials,
  InvoiceStatusConflictError,
  updateInvoiceStatus,
} from '@/lib/supabase/admin-queries';
import { createAdminClient } from '@/lib/supabase/server';
import { KsefApiError } from '@/lib/ksef/client';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { KsefInvoiceRejectedError } from '@/lib/ksef/submit';
import {
  hasKsefDuplicateMarker,
  isKsefDuplicateFailure,
  KSEF_DUPLICATE_RECONCILIATION_CODE,
} from '@/lib/ksef/submit-reconciliation';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { InvoiceValidationError } from '@/lib/xml/fa3-generator';
import {
  getKsefRetryDelay,
  KSEF_MAX_RETRIES,
  KSEF_TENANT_CONCURRENCY_LIMIT,
  KSEF_TENANT_THROTTLE_LIMIT,
  KSEF_TENANT_THROTTLE_PERIOD,
} from '../retry-schedule';

/**
 * Job wysyłki faktury do KSeF.
 *
 * Trigger: event 'invoice/submit.requested' (publikowany z Server Action
 * po kliknięciu "Wyślij do KSeF" w UI).
 *
 * Retry policy (Faza 23 sekcja 2):
 * - Custom backoff: 30s → 2min → 5min → 15min → 1h przez `RetryAfterError`.
 *   Override Inngest defaultu (10s/30s/1m/5m/15m), dający MF ponad godzinę
 *   na recovery po większej awarii.
 * - Przed atomowym claimem bezpieczne błędy mogą mieć retry z opóźnieniem.
 * - Po claimie każdy niepewny wynik kończy się ręcznym uzgodnieniem. Nie
 *   ponawiamy POST, ponieważ poprzednia próba mogła dotrzeć do KSeF.
 *
 * Concurrency + throttle (Faza 23 sekcja 2):
 * - Per-tenant concurrency: max 100 równoległych submit'ów. Wyższy limit
 *   per-tenant (vs poprzednie 3 per-NIP) dla dużych tenantów z 1000+ fakturami
 *   miesięcznie; rate-limiter per-NIP wewnątrz KSeF clienta i tak zatrzyma
 *   nadmiar.
 * - Per-tenant throttle: 60 wysyłek/min — chroni MF przed zalaniem przy
 *   bulk import, nawet jeśli concurrency 100 da chwilowy spike.
 */

async function readCurrentInvoiceKsefState(invoiceId: string, tenantId: string) {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('direction, ksef_status, ksef_number, ksef_environment, invoice_kind, submitted_to_ksef_at, last_error_code, last_error')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) {
    throw new Error('Nie można potwierdzić bieżącego stanu faktury KSeF');
  }
  return data;
}

/**
 * Obsługa po wyczerpaniu prób (Etap 7) — wspólna dla Inngest `onFailure`
 * i pg-boss `onExhausted`. Klasyfikuje porażkę na trzy ścieżki:
 * `rejected` (pewna odmowa przed kontaktem) lub `failed` (wynik wymagający
 * uzgodnienia). Automatyczny parking i replay Offline24 są wstrzymane.
 */
export async function onSubmitInvoiceExhausted(
  error: Error,
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  { step, logger }: JobContext,
) {
      const parsed = invoiceSubmitRequested.safeParse(data);
      if (!parsed.success) {
        logger.error('KSeF submit event invalid; invoice requires reconciliation', {
          reason: 'invalid-payload',
        });
        return { handled: false, reason: 'invalid-payload' };
      }
      const { tenantId, invoiceId, nip, invoice } = parsed.data;
      if (parsed.data.environment !== configuredKsefEnvironment()) {
        logger.error('KSeF submit event environment mismatch; invoice requires reconciliation', {
          tenantId,
          invoiceId,
          eventEnvironment: parsed.data.environment,
          configuredEnvironment: configuredKsefEnvironment(),
        });
        return { handled: false, reason: 'environment-mismatch' };
      }
      await requireInvoiceTenant(invoiceId, tenantId);
      const current = await readCurrentInvoiceKsefState(invoiceId, tenantId);
      if (current.direction === 'incoming') {
        logger.error('KSeF submit failure callback targets an incoming invoice; no invoice state changed', {
          tenantId,
          invoiceId,
        });
        return { handled: false, reason: 'invoice-direction-mismatch' };
      }
      const observedKsefStatus = current.ksef_status;
      const fromOfflineQueue = Boolean(parsed.data.fromOfflineQueue);
      // A historical Offline24 callback must never turn an unrelated draft,
      // queued, sending or accepted invoice into failed. Close its old queue
      // reference through the dedicated handler; only offline_queued may have
      // its invoice state changed below.
      if (fromOfflineQueue && current.ksef_status !== 'offline_queued') {
        logger.error('Legacy Offline24 event is detached from invoice state; queue requires reconciliation', {
          tenantId,
          invoiceId,
          currentStatus: current.ksef_status,
        });
        await step.sendEvent('emit-failure', {
          name: 'invoice/submit.failed',
          data: {
            invoiceId,
            tenantId,
            error: 'Legacy Offline24 event requires manual reconciliation',
            environment: parsed.data.environment,
            fromOfflineQueue: true,
            offlineQueueId: parsed.data.offlineQueueId,
            terminal: true,
          },
        });
        return { handled: false, reason: 'offline-state-mismatch' };
      }
      if (current.ksef_status === 'accepted') {
        logger.error('KSeF accepted invoice was not changed by failed submit callback; manual reconciliation required', {
          invoiceId,
          eventEnvironment: parsed.data.environment,
          storedEnvironment: current.ksef_environment ?? null,
        });
        return { handled: false, reason: 'accepted-reconciliation' };
      }
      if (error.message.includes('KSEF_SUBMIT_CLAIM_LOST')) {
        logger.warn('KSeF submit claim belongs to another worker; ignoring duplicate callback', {
          tenantId,
          invoiceId,
        });
        return { handled: false, reason: 'claim-lost' };
      }
      if (error.message.includes('KSEF_RESULT_CAS_CONFLICT')) {
        logger.error('KSeF accepted result no longer owns its invoice claim; operator reconciliation required', {
          tenantId,
          invoiceId,
        });
        return { handled: false, reason: 'result-claim-conflict' };
      }
      // A different worker may have acquired this claim after this event
      // failed before its own claim. A status-only CAS cannot identify the
      // owner of `sending`, so do not change it from a generic callback.
      if (current.ksef_status === 'sending') {
        const duplicate = isKsefDuplicateFailure(error.message);
        logger.error('KSeF sending claim remains pending after failure; operator reconciliation required', {
          tenantId,
          invoiceId,
          duplicate,
        });
        Sentry.captureMessage('KSeF sending claim requires reconciliation', {
          level: 'error',
          tags: { job: 'submit-invoice', kind: duplicate ? 'duplicate-reconciliation' : 'sending-reconciliation' },
          extra: { tenantId, invoiceId },
        });
        return { handled: false, reason: duplicate ? 'duplicate-reconciliation' : 'sending-reconciliation' };
      }
      if (hasKsefDuplicateMarker(current) &&
          !isKsefDuplicateFailure(error.message)) {
        logger.warn('KSeF duplicate marker remains pending; ignoring stale failure callback', {
          tenantId,
          invoiceId,
        });
        return { handled: false, reason: 'duplicate-reconciliation' };
      }
      // An old callback must not rewrite the diagnostics of a terminal row.
      // A status-only CAS cannot detect another callback adding the 440 marker
      // while this callback is awaiting a step.
      if ((current.ksef_status === 'failed' || current.ksef_status === 'rejected') &&
          !isKsefDuplicateFailure(error.message)) {
        return { handled: false, reason: 'historical-reconciliation' };
      }
      // Klasyfikacja błędu (Faza 23 sekcja 3):
      //   - pewna odmowa przed kontaktem → rejected;
      //   - niepewny wynik i stare Offline24 → failed/manual reconciliation.
      // Nie tworzymy nowej kolejki offline po wyczerpaniu prób.
      // A pre-submit integrity guard on a special document is not a KSeF
      // rejection. Keep it visible as failed/manual reconciliation.
      const duplicateNeedsReconciliation = isKsefDuplicateFailure(error.message);
      const requiresManualReconciliation = Boolean(current.submitted_to_ksef_at) ||
        duplicateNeedsReconciliation ||
        error.message.includes('manual reconciliation');
      const isBusinessRejection = error.name === 'NonRetriableError' &&
        current.invoice_kind === 'regular' &&
        !requiresManualReconciliation &&
        !(fromOfflineQueue && parsed.data.environment === 'production');
      const isTransientFailure = !isBusinessRejection && !requiresManualReconciliation;

      logger.error('Job wysyłki padł — klasyfikacja błędu', {
        tenantId,
        invoiceId,
        nip,
        internalNumber: invoice.internalNumber,
        errorName: error.name,
        errorMessage: error.message,
        isBusinessRejection,
        isTransientFailure,
        requiresManualReconciliation,
        fromOfflineQueue,
      });

      // Without durable attempt provenance, no failed submit enters Offline24.
      const finalStatus: 'rejected' | 'failed' = isBusinessRejection
        ? 'rejected'
        : 'failed';

      try {
      if (fromOfflineQueue) {
        // Już byliśmy w offline queue — nie zapętlamy parkingu. Mark final.
        await step.run('mark-as-failed-from-offline', async () => {
          await updateInvoiceStatus(invoiceId, {
            ksef_status: finalStatus,
            last_error: `${error.name}: ${error.message}`,
            last_error_code: duplicateNeedsReconciliation ? KSEF_DUPLICATE_RECONCILIATION_CODE : null,
            last_error_field: null,
            last_error_suggestion: null,
          }, tenantId, observedKsefStatus);
        });
      } else {
        // Unsupported special documents stay failed for manual reconciliation;
        // an ordinary business rejection keeps its rejected status.
        await step.run('mark-as-final', async () => {
          await updateInvoiceStatus(invoiceId, {
            ksef_status: finalStatus,
            last_error: `${error.name}: ${error.message}`,
            last_error_code: duplicateNeedsReconciliation ? KSEF_DUPLICATE_RECONCILIATION_CODE : null,
            last_error_field: null,
            last_error_suggestion: null,
          }, tenantId, observedKsefStatus);
        });
      }
      } catch (statusError) {
        if (statusError instanceof InvoiceStatusConflictError) {
          logger.warn('KSeF invoice changed while processing a failed callback; ignoring stale outcome', {
            tenantId,
            invoiceId,
          });
          return { handled: false, reason: 'status-changed' };
        }
        throw statusError;
      }

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
            isBusinessRejection,
            wasFromOfflineQueue: fromOfflineQueue,
            error: `${error.name}: ${error.message}`,
          },
        });
      });

      await step.sendEvent('emit-failure', {
        name: 'invoice/submit.failed',
        data: {
          invoiceId,
          tenantId,
          error: `${error.name}: ${error.message}`,
          environment: parsed.data.environment,
          fromOfflineQueue: data.fromOfflineQueue,
          offlineQueueId: parsed.data.offlineQueueId,
          // Legacy handler closes every old Offline24 row; terminal also
          // states that this outcome must never be retried automatically.
          terminal: requiresManualReconciliation || error.name === 'NonRetriableError',
        },
      });

      return { handled: true, finalStatus, fromOfflineQueue };
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runSubmitInvoice(
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  { step, logger, attempt }: JobContext,
) {
    // Runtime walidacja Zod — bramka między event store a transakcją KSeF.
    // Zła paczka (np. brak NIP-u po replay'u eventu ze starego kodu) zostaje
    // odrzucona PRZED jakąkolwiek operacją w DB / R2 / KSeF. NonRetriableError
    // zatrzymuje retry i woła `onFailure`, który oznacza fakturę jako rejected.
    const parsed = invoiceSubmitRequested.safeParse(data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `Niepoprawny payload eventu invoice/submit.requested: ${parsed.error.message}`,
        { cause: parsed.error },
      );
    }
    const { tenantId, invoiceId, invoice, nip } = parsed.data;
    const env = configuredKsefEnvironment();
    if (!env || parsed.data.environment !== env) {
      throw new NonRetriableError('KSeF submit event environment does not match configured environment');
    }
    if (parsed.data.fromOfflineQueue && env === 'production') {
      throw new NonRetriableError('Legacy PROD Offline24 QR requires manual reconciliation');
    }
    // Historical Offline24 rows have no durable attempt generation. A queued
    // row plus a null timestamp does not prove that an old KSeF POST never
    // happened. Keep all automatic replay disabled until provenance is stored
    // and old rows have been reconciled; this applies to TEST/demo as well.
    if (parsed.data.fromOfflineQueue) {
      throw new NonRetriableError('Offline24 automatic replay requires manual reconciliation');
    }
    await requireInvoiceTenant(invoiceId, tenantId);
    const fromOfflineQueue = Boolean(parsed.data.fromOfflineQueue);
    if (fromOfflineQueue) {
      assertJobIdentity(parsed.data.offlineQueueId, tenantId);
      const { data: queueRow, error: queueError } = await createAdminClient()
        .from('ksef_offline_queue')
        .select('id')
        .eq('id', parsed.data.offlineQueueId!)
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .eq('ksef_environment', env)
        .eq('status', 'sending')
        .maybeSingle();
      if (queueError || !queueRow) {
        throw new NonRetriableError('Offline24 queue reference requires reconciliation');
      }
    }

    // IDEMPOTENCJA (audyt przedlaunchowy): backstop przeciw podwójnej wysyłce.
    // Gdyby ten sam event przyszedł dwa razy (double-click „Wyślij", replay
    // eventu, równoległy enqueue z dwóch instancji), NIE wysyłamy faktury do
    // KSeF drugi raz — jeśli ma już numer KSeF i status 'accepted', zwracamy
    // istniejący wynik. To uzupełnia: deterministyczny generator FA(3) (ten sam
    // XML), idempotencję R2 (HEAD + IfNoneMatch) oraz unikalność numeru P_2 po
    // stronie MF. Trzy niezależne warstwy ochrony przed duplikatem w KSeF.
    // Inngest restarts the function body after each completed step. Memoize
    // this initial decision for this run so a successful submit step can reach
    // save-ksef-number on replay. A *new* run observes the current DB state;
    // the submit step itself always re-reads before its atomic claim.
    const alreadyDone = await step.run('read-existing-invoice', () =>
      readCurrentInvoiceKsefState(invoiceId, tenantId),
    );
    if (alreadyDone.direction === 'incoming') {
      throw new NonRetriableError('KSeF incoming invoice requires manual reconciliation');
    }
    if (alreadyDone?.ksef_status === 'accepted' && alreadyDone.ksef_environment !== env) {
      logger.error('KSeF accepted invoice environment requires manual reconciliation', {
        invoiceId,
        environment: env,
        storedEnvironment: alreadyDone.ksef_environment ?? null,
      });
      throw new NonRetriableError('KSeF accepted invoice environment requires manual reconciliation');
    }
    if (alreadyDone?.ksef_status === 'accepted' && alreadyDone.ksef_environment === env && alreadyDone.ksef_number) {
      logger.info('Faktura już zaakceptowana w KSeF — pomijam ponowną wysyłkę', {
        invoiceId,
        ksefNumber: alreadyDone.ksef_number,
      });
      // pg-boss has no step memoization. A crash after the accepted DB write
      // but before the UPO event otherwise leaves no upo_receipts row, which
      // the stale-UPO retry cron cannot discover. Re-emit only if absent.
      const { data: upo, error: upoError } = await createAdminClient()
        .from('upo_receipts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .eq('ksef_number', alreadyDone.ksef_number)
        .maybeSingle();
      if (upoError) throw new Error('Nie można sprawdzić rekordu UPO zaakceptowanej faktury');
      if (!upo) {
        await step.sendEvent('recover-upo-after-accepted', {
          name: 'invoice/upo.requested',
          data: {
            invoiceId,
            tenantId,
            nip,
            ksefNumber: alreadyDone.ksef_number,
            environment: env,
          },
        });
      }
      return {
        alreadyAccepted: true as const,
        ksefNumber: alreadyDone.ksef_number,
      };
    }
    // A fresh event or a pg-boss retry cannot distinguish a crash after the
    // KSeF POST from a crash before it. Stop until an operator reconciles it.
    if (hasKsefDuplicateMarker(alreadyDone) ||
        alreadyDone.submitted_to_ksef_at ||
        alreadyDone.ksef_status === 'sending' ||
        alreadyDone.ksef_status === 'failed' ||
        alreadyDone.ksef_status === 'rejected') {
      throw new NonRetriableError(
        'KSeF prior submission may have reached the authority; manual reconciliation required',
      );
    }

    await step.run('validate-submit-references', () =>
      assertSubmitReferences({
        supabase: createAdminClient(),
        tenantId,
        invoiceId,
        invoice,
        environment: env,
        correctionData: parsed.data.correctionData,
        advanceData: parsed.data.advanceData,
        finalData: parsed.data.finalData,
        finalAdvanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
      }),
    );

    logger.info('Rozpoczynam wysyłkę faktury', {
      tenantId,
      invoiceId,
      nip,
      internalNumber: invoice.internalNumber,
      fromOfflineQueue,
      attempt,
    });

    // Throw *inside* the step so an outage is not memoized as a permanent
    // `offline=true` result. A successful preflight may be memoized; the
    // submit callback checks health again immediately before the claim.
    await step.run('preflight-ksef-health', async () => {
      const health = await shouldUseOfflineMode(env);
      if (health.offline) {
        throw new RetryAfterError(
          'KSeF unavailable; automatic Offline24 is paused pending reconciliation',
          getKsefRetryDelay(attempt),
        );
      }
    });

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

    await step.run('verify-ksef-claimed', async () => {
      try {
        await requireKsefVerificationForBackgroundJob(tenantId);
      } catch (e) {
        if (e instanceof KsefNotVerifiedError) {
          throw new NonRetriableError(
            'Organizacja nie ma zweryfikowanego certyfikatu KSeF (Ustawienia → KSeF). Wysyłka do KSeF jest zablokowana.',
            { cause: e },
          );
        }
        throw e;
      }
    });

    await step.run('audit-start', async () => {
      await logAuditSystem({
        action: 'invoice.submit_requested',
        tenantId,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { attempt: attempt + 1, maxAttempts: KSEF_MAX_RETRIES + 1 },
      });
    });

    // Krok 3: pełny flow (generuj XML → waliduj XSD → R2 → KSeF).
    // Credentials wczytujemy świeżo wewnątrz tego step.run — return value
    // tego stepu jest stripowany przez `submitInvoiceFullFlow` do meta-danych
    // wyniku (ksefNumber, hash, path), więc nic wrażliwego nie wycieka do
    // Inngest store'u.
    //
    // The claim is INSIDE this step callback, immediately before KSeF I/O.
    // Inngest may replay the callback after a crash before its checkpoint;
    // a replay must lose the DB claim rather than perform a second POST.
    // Credentials stay out of the event and durable step result.
    const result = await step.run('submit-to-ksef', async () => {
      // Health gates belong inside the submit callback. A cached outage must
      // be rechecked on pre-claim retry, while a durable successful submit
      // result must reach save-ksef-number even if health later turns red.
      const health = await shouldUseOfflineMode(env);
      if (health.offline) {
        throw new RetryAfterError(
          'KSeF unavailable; automatic Offline24 is paused pending reconciliation',
          getKsefRetryDelay(attempt),
        );
      }
      if (attempt > 0) {
        const { isKsefHealthy } = await import('@/lib/ksef/health-status');
        const healthy = await isKsefHealthy(env);
        if (!healthy) {
          const delay = getKsefRetryDelay(attempt);
          logger.warn('KSeF zgłaszany jako down — odkładam próbę', {
            tenantId,
            invoiceId,
            attempt,
            retryAfter: delay,
          });
          throw new RetryAfterError(
            'KSeF health monitor zgłasza down — odkładam wysyłkę',
            delay,
          );
        }
      }
      // Re-read immediately before KSeF I/O: earlier steps may be memoized or
      // another worker may have accepted this invoice in the meantime.
      const fresh = await readCurrentInvoiceKsefState(invoiceId, tenantId);
      if (fresh.ksef_status === 'accepted') {
        throw new NonRetriableError('KSeF invoice was accepted before submit; manual reconciliation required');
      }
      if (hasKsefDuplicateMarker(fresh) ||
          fresh.submitted_to_ksef_at ||
          fresh.ksef_status === 'sending' ||
          fresh.ksef_status === 'failed' ||
          fresh.ksef_status === 'rejected') {
        throw new NonRetriableError(
          'KSeF prior submission may have reached the authority; manual reconciliation required',
        );
      }
      const credentials = await getTenantKsefCredentials(tenantId);
      const claimTimestamp = await claimInvoiceForKsefSend(invoiceId, tenantId, fromOfflineQueue);
      if (!claimTimestamp) {
        throw new NonRetriableError('KSEF_SUBMIT_CLAIM_LOST: manual reconciliation required');
      }

      try {
        // The claim moves draft/queued -> sending. Migration 00088 freezes
        // legal content at that transition, so compare the persisted document
        // with the event *after* the claim and before any KSeF POST. If the
        // comparison fails, leave sending for operator reconciliation.
        await assertSubmitReferences({
          supabase: createAdminClient(),
          tenantId,
          invoiceId,
          invoice,
          environment: env,
          correctionData: parsed.data.correctionData,
          advanceData: parsed.data.advanceData,
          finalData: parsed.data.finalData,
          finalAdvanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
        });
        // Po refaktorze na zodEvent korzystamy z `parsed.data` (zwalidowanego),
        // a nie z surowego `data` — typy są pewne, bez `as` casta.
        const finalPayload =
          parsed.data.finalData &&
          parsed.data.finalAdvanceSettlementRows &&
          parsed.data.finalAdvanceSettlementRows.length > 0
            ? {
                finalData: parsed.data.finalData,
                advanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
              }
            : null;

        const submitted = await submitInvoiceFullFlow(
          tenantId,
          invoiceId,
          invoice,
          credentials,
          env,
          parsed.data.correctionData ?? null,
          parsed.data.advanceData ?? null,
          finalPayload,
        );
        return { ...submitted, claimTimestamp };
      } catch (error) {
        if (error instanceof KsefNotVerifiedError) {
          throw new NonRetriableError(
            'Organizacja nie ma zweryfikowanego certyfikatu KSeF (Ustawienia → KSeF). Wysyłka do KSeF jest zablokowana.',
            { cause: error },
          );
        }
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
            extra: { tenantId, invoiceId, ksefCode: error.ksefCode, status: error.status },
          });
          throw new NonRetriableError(
            `KSeF odrzucił fakturę (HTTP ${error.status}): ${error.message}`,
            { cause: error },
          );
        }
        // Odrzucenie w STATUSIE faktury (HTTP 200, kod ≥ 400) — ta sama decyzja
        // o treści co wyżej. Wcześniej leciało jako zwykły Error: 5 ponownych
        // wysyłek, potem Offline24. Przy 440 (duplikat) faktura już JEST w KSeF.
        if (error instanceof KsefInvoiceRejectedError) {
          Sentry.captureException(error, {
            tags: {
              job: 'submit-invoice',
              kind: error.isDuplicate ? 'ksef-duplicate' : 'ksef-rejection',
            },
            extra: {
              tenantId,
              invoiceId,
              ksefStatusCode: error.code,
              originalKsefNumber: error.originalKsefNumber,
            },
          });
          throw new NonRetriableError(
            error.isDuplicate
              ? `${KSEF_DUPLICATE_RECONCILIATION_CODE}: ${error.message}`
              : error.message,
            { cause: error },
          );
        }
        // Claim was persisted before KSeF I/O. Even if this error
        // happened locally before POST, we cannot safely infer that from a
        // serialized job failure or a restarted pg-boss process.
        const isKsefApi = error instanceof KsefApiError;
        const errorLabel = isKsefApi
          ? `KSeF HTTP ${error.status}: ${error.message}`
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'Nieznany błąd';

        logger.error('Niepewny wynik wysyłki KSeF — wymagane ręczne uzgodnienie', {
          tenantId,
          invoiceId,
          attempt,
          errorLabel,
        });

        Sentry.addBreadcrumb({
          category: 'ksef.submit',
          level: 'warning',
          message: 'KSeF submission requires reconciliation',
          data: { tenantId, invoiceId, attempt, errorLabel },
        });

        throw new NonRetriableError(`KSeF send result uncertain; manual reconciliation required: ${errorLabel}`, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    });

    // Krok 4: zapisz numer KSeF i timestamp akceptacji do bazy.
    await step.run('save-ksef-number', async () => {
      try {
        await updateInvoiceStatus(invoiceId, {
          ksef_status: 'accepted',
          ksef_number: result.ksefNumber,
          ksef_environment: env,
          ksef_accepted_at: result.acquisitionTimestamp,
          xml_storage_path: result.xmlStoragePath,
          last_error: null,
          last_error_code: null,
          last_error_field: null,
          last_error_suggestion: null,
        }, tenantId, 'sending', result.claimTimestamp);
      } catch (error) {
        if (error instanceof InvoiceStatusConflictError) {
          const current = await readCurrentInvoiceKsefState(invoiceId, tenantId);
          const sameAttempt = Boolean(current.submitted_to_ksef_at) &&
            new Date(current.submitted_to_ksef_at).getTime() ===
              new Date(result.claimTimestamp).getTime();
          if (sameAttempt &&
              current.ksef_status === 'accepted' &&
              current.ksef_number === result.ksefNumber &&
              current.ksef_environment === env) {
            // The DB write succeeded but the Inngest step checkpoint did not.
            // Complete downstream UPO/audit/success steps without another POST.
          } else {
            throw new NonRetriableError(
              'KSEF_RESULT_CAS_CONFLICT: accepted result requires manual reconciliation',
              { cause: error },
            );
          }
        } else {
          throw error;
        }
      }

    });

    // UPO is the legal receipt. Cache and analytics must not delay its request.
    await step.sendEvent('trigger-upo-download', {
      name: 'invoice/upo.requested',
      data: {
        invoiceId,
        tenantId,
        // `nip` powędruje do `downloadUpoJob` jako klucz concurrency
        // (`{ key: 'data.nip', limit: 3 }`) — limit per-tenant zapobiega
        // zalaniu KSeF /upo żądaniami z jednego podmiotu.
        nip,
        ksefNumber: result.ksefNumber,
        environment: env,
      },
    });

    await step.run('invalidate-tenant-dashboard', async () => {
      const { invalidateTenantDashboard } = await import('@/lib/cache/invalidation');
      await invalidateTenantDashboard(tenantId);
    });

    await step.run('analytics-invoice-accepted', async () => {
      await trackServer({
        distinctId: tenantId,
        event: ANALYTICS_EVENTS.invoiceAccepted,
        properties: {
          ksef_env: env,
          internal_number: invoice.internalNumber ?? null,
        },
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

    await step.sendEvent('emit-success', {
      name: 'invoice/submit.succeeded',
      data: {
        invoiceId,
        tenantId,
        ksefNumber: result.ksefNumber,
        environment: env,
        fromOfflineQueue: data.fromOfflineQueue,
        offlineQueueId: parsed.data.offlineQueueId,
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
}

export const submitInvoiceJob = inngest.createFunction(
  {
    id: 'submit-invoice-to-ksef',
    name: 'Wysyłka faktury do KSeF',
    retries: KSEF_MAX_RETRIES,
    concurrency: {
      key: 'event.data.tenantId',
      limit: KSEF_TENANT_CONCURRENCY_LIMIT,
    },
    throttle: {
      key: 'event.data.tenantId',
      limit: KSEF_TENANT_THROTTLE_LIMIT,
      period: KSEF_TENANT_THROTTLE_PERIOD,
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
    // `error` jest serializowany przez JSON (cross-process), więc
    // `instanceof` nie działa — klasyfikacja idzie po `error.name`
    // (tak samo rozpoznaje je worker pg-boss, patrz lib/jobs/retry.ts).
    onFailure: async ({ error, event, step, logger, attempt }) =>
      onSubmitInvoiceExhausted(
        error,
        (
          event.data.event as {
            data: Parameters<typeof invoiceSubmitRequested.create>[0];
          }
        ).data,
        toJobContext({ step, logger, attempt }),
      ),
  },
  async ({ event, step, logger, attempt }) =>
    runSubmitInvoice(
      event.data as Parameters<typeof invoiceSubmitRequested.create>[0],
      toJobContext({ step, logger, attempt }),
    ),
);
