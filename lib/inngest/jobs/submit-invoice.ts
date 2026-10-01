import { requireInvoiceTenant } from './tenant-boundary';
import * as Sentry from '@sentry/nextjs';
import { NonRetriableError, RetryAfterError } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { logAuditSystem } from '@/lib/audit/log-system';
import { inngest, invoiceSubmitRequested } from '../client';
import { submitInvoiceFullFlow } from '@/lib/ksef/submit-invoice-full';
import {
  KsefNotVerifiedError,
  requireKsefVerificationForBackgroundJob,
} from '@/lib/auth/ksef-verification-guard';
import {
  getTenantKsefCredentials,
  updateInvoiceStatus,
} from '@/lib/supabase/admin-queries';
import { createAdminClient } from '@/lib/supabase/server';
import { KsefApiError } from '@/lib/ksef/client';
import { checkInvoiceStatusByReference, KsefInvoiceRejectedError } from '@/lib/ksef/submit';
import { ksefSessionCache } from '@/lib/ksef/session-cache';
import {
  findOpenKsefSubmission,
  isOwnKsefSession,
  markKsefSubmission,
} from '@/lib/ksef/submission-log';
import { invoiceXmlKey } from '@/lib/storage/r2';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { isRozSubmission, ROZ_SUBMISSION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import { InvoiceValidationError } from '@/lib/xml/fa3-generator';
import {
  getKsefRetryDelay,
  KSEF_MAX_RETRIES,
  KSEF_TENANT_CONCURRENCY_LIMIT,
  KSEF_TENANT_THROTTLE_LIMIT,
  KSEF_TENANT_THROTTLE_PERIOD,
} from '../retry-schedule';

/**
 * Odpowiedź 440 „duplikat”, której NIE da się przypisać do naszej wcześniejszej
 * wysyłki tej faktury (inny numer sesji albo brak historii). KSeF wykrywa
 * duplikat po numerze faktury sprzedawcy, a ten numer mógł zostać użyty poza
 * FaktFlow — przypięcie cudzego numeru KSeF byłoby błędnym zapisem prawnym.
 * Stan neutralny „do uzgodnienia” (jak wstrzymana ROZ), bez komunikatu
 * „odrzucona”. Znacznik w treści błędu, bo przechodzi przez oba backendy jobów.
 */
export const KSEF_DUPLICATE_RECONCILE = 'KSEF_DUPLICATE_RECONCILE';

/** Wynik wysyłki niezależnie od drogi: nowa wysyłka, uzgodnienie albo własny duplikat. */
interface SubmitOutcome {
  ksefNumber: string;
  xmlStoragePath: string;
  acquisitionTimestamp?: string;
  sessionReferenceNumber?: string;
  invoiceReferenceNumber?: string;
  /** Skąd wiemy o akceptacji — do audytu. */
  via: 'submit' | 'reference-reconcile' | 'own-duplicate';
}

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
 * - Błędy 5xx i 429 — retry z opóźnieniem.
 * - Błędy 4xx (walidacja, auth, 404) — `NonRetriableError`, leci do
 *   `onFailure` → faktura `rejected`.
 *
 * Concurrency + throttle (Faza 23 sekcja 2):
 * - Per-tenant concurrency: max 100 równoległych submit'ów. Wyższy limit
 *   per-tenant (vs poprzednie 3 per-NIP) dla dużych tenantów z 1000+ fakturami
 *   miesięcznie; rate-limiter per-NIP wewnątrz KSeF clienta i tak zatrzyma
 *   nadmiar.
 * - Per-tenant throttle: 60 wysyłek/min — chroni MF przed zalaniem przy
 *   bulk import, nawet jeśli concurrency 100 da chwilowy spike.
 */

const ROZ_RECONCILIATION_MESSAGE =
  'Wysyłka faktury rozliczającej została wstrzymana. Przed kolejną próbą ręcznie uzgodnij jej status z KSeF.';

/** Fresh DB read outside Inngest steps, including the accepted status. */
async function currentSubmissionState(
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
): Promise<{
  ksef_status: string | null;
  ksef_number: string | null;
  invoice_type: string | null;
  invoice_kind: string | null;
}> {
  const { data: stored, error } = await (await createAdminClient())
    .from('invoices')
    .select('ksef_status, ksef_number, invoice_type, invoice_kind')
    .eq('id', data.invoiceId)
    .eq('tenant_id', data.tenantId)
    .maybeSingle();

  if (error || !stored) throw new Error('Nie można sprawdzić rodzaju faktury');

  return stored;
}

function isHeldRozSubmission(
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  stored: Awaited<ReturnType<typeof currentSubmissionState>>,
): boolean {
  return isRozSubmission({
    invoiceType: data.invoice.type,
    storedInvoiceType: stored.invoice_type,
    invoiceKind: stored.invoice_kind,
    finalData: data.finalData,
    finalAdvanceSettlementRows: data.finalAdvanceSettlementRows,
  });
}

/** Reconcile an accepted invoice even if the success event was lost. */
async function reconcileAcceptedOfflineQueue(
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  force = false,
): Promise<void> {
  if (!data.fromOfflineQueue && !force) return;
  const { error } = await (await createAdminClient())
    .from('ksef_offline_queue')
    .update({ status: 'sent', last_error: null })
    .eq('invoice_id', data.invoiceId)
    .eq('tenant_id', data.tenantId)
    .in('status', ['queued', 'sending', 'failed', 'expired']);
  if (error) throw new Error('Nie można uzgodnić zaakceptowanej faktury z kolejką Offline24');
}

async function markFailureUnlessAccepted(
  invoiceId: string,
  tenantId: string,
  status: 'failed' | 'rejected',
  lastError: string,
): Promise<boolean> {
  const { data: updated, error } = await (await createAdminClient())
    .from('invoices')
    .update({
      ksef_status: status,
      last_error: lastError,
      last_error_code: null,
      last_error_field: null,
      last_error_suggestion: null,
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .or('ksef_status.is.null,ksef_status.neq.accepted')
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Nie można zapisać wyniku wysyłki faktury');
  return updated?.id === invoiceId;
}

/**
 * Obsługa po wyczerpaniu prób (Etap 7) — wspólna dla Inngest `onFailure`
 * i pg-boss `onExhausted`. Klasyfikuje porażkę na trzy ścieżki:
 * `rejected` (walidacja / 4xx — KSeF i tak nie przyjmie), `offline_queued`
 * (błąd przejściowy → parking w trybie Offline24) oraz `failed`
 * (Offline24 niedostępny albo wracaliśmy już z niego).
 */
export async function onSubmitInvoiceExhausted(
  error: Error,
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  { step, logger }: JobContext,
) {
      const parsed = invoiceSubmitRequested.safeParse(data);
      if (!parsed.success) return { handled: false, reason: 'invalid-payload' };
      const { tenantId, invoiceId, nip, invoice } = parsed.data;
      await requireInvoiceTenant(invoiceId, tenantId);
      const fromOfflineQueue = Boolean(data.fromOfflineQueue);
      const current = await currentSubmissionState(parsed.data);
      if (current.ksef_status === 'accepted' && current.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data, true);
        return { handled: true, alreadyAccepted: true, ksefNumber: current.ksef_number };
      }
      const heldRoz = isHeldRozSubmission(parsed.data, current);
      const duplicateReconcile = !heldRoz && error.message.includes(KSEF_DUPLICATE_RECONCILE);
      const reconcileHold = heldRoz || duplicateReconcile;

      // Klasyfikacja błędu (Faza 23 sekcja 3):
      //   - `NonRetriableError` → walidacja / 4xx → 'rejected' (nie ma sensu
      //     parkować w Offline24, KSeF nigdy tego nie zaakceptuje).
      //   - Inny (RetryAfterError po wyczerpaniu retries, generic Error) →
      //     transient outage → Offline24 fallback.
      //   - Z Offline24 (`fromOfflineQueue=true`) — już parkowane, nie
      //     duplikujemy. Mark 'failed' i emit event.
      const isBusinessRejection = !reconcileHold && error.name === 'NonRetriableError';
      const isTransientFailure = !isBusinessRejection && !reconcileHold;
      const failureMessage = heldRoz
        ? ROZ_RECONCILIATION_MESSAGE
        : duplicateReconcile
          ? error.message.replace(`[${KSEF_DUPLICATE_RECONCILE}] `, '')
          : `${error.name}: ${error.message}`;

      logger.error('Job wysyłki padł — klasyfikacja błędu', {
        tenantId,
        invoiceId,
        nip,
        internalNumber: invoice.internalNumber,
        errorName: error.name,
        errorMessage: error.message,
        heldRoz,
        duplicateReconcile,
        isBusinessRejection,
        isTransientFailure,
        fromOfflineQueue,
      });

      // Outcome zapisujemy po decyzji o ścieżce (rejected/offline_queued/failed).
      let finalStatus: 'rejected' | 'failed' | 'offline_queued' = isBusinessRejection
        ? 'rejected'
        : 'failed';
      let statusWriteLost = false;

      if (reconcileHold) {
        // A local safety hold (ROZ) or a 440 we cannot attribute to our own
        // earlier submission is not a rejection from KSeF. A conditional
        // update cannot overwrite a concurrent acceptance by another worker.
        const marked = await step.run(heldRoz ? 'mark-as-failed-roz-hold' : 'mark-as-duplicate-reconcile', async () => {
          const { data: updated, error: updateError } = await (await createAdminClient())
            .from('invoices')
            .update({
              ksef_status: 'failed',
              last_error: failureMessage,
              last_error_code: heldRoz ? 'ROZ_HOLD_RECONCILE' : KSEF_DUPLICATE_RECONCILE,
              last_error_field: null,
              last_error_suggestion: null,
            })
            .eq('id', invoiceId)
            .eq('tenant_id', tenantId)
            .or('ksef_status.is.null,ksef_status.neq.accepted')
            .select('id')
            .maybeSingle();
          if (updateError) throw new Error('Nie można oznaczyć faktury do uzgodnienia');
          return updated?.id === invoiceId;
        });
        if (!marked) {
          const latest = await currentSubmissionState(parsed.data);
          if (latest.ksef_status === 'accepted' && latest.ksef_number) {
            await reconcileAcceptedOfflineQueue(parsed.data, true);
            return { handled: true, alreadyAccepted: true, ksefNumber: latest.ksef_number };
          }
          throw new Error('Nie można potwierdzić stanu faktury do uzgodnienia');
        }
      } else if (fromOfflineQueue) {
        // Już byliśmy w offline queue — nie zapętlamy parkingu. Mark final.
        const marked = await step.run('mark-as-failed-from-offline', () =>
          markFailureUnlessAccepted(invoiceId, tenantId, isBusinessRejection ? 'rejected' : 'failed', failureMessage));
        statusWriteLost = marked === false;
      } else if (isTransientFailure) {
        // Faza 23 sekcja 3: po wyczerpaniu 5 retries z błędem retry-owalnym
        // (5xx, 429, timeout, RetryAfterError) → parking w Offline24 queue.
        // `addToOfflineQueue` ustawia `invoices.ksef_status = 'offline_queued'`.
        // QR II wymaga odrębnego certyfikatu KSeF typu Offline; kolejka nie
        // zapisuje kodów na podstawie certyfikatu uwierzytelniania.
        const offlineResult = await step.run('try-offline-queue', async () => {
          try {
            const { getTenantKsefCredentials } = await import('@/lib/supabase/admin-queries');
            const { addToOfflineQueue } = await import('@/lib/ksef/offline-queue');

            const creds = await getTenantKsefCredentials(tenantId);
            // Offline24 QR wymaga PEM certyfikatu — token auth (dev/test)
            // nie ma takiego. W tym przypadku jedziemy klasycznym 'failed'.
            if (creds.type !== 'xades') {
              return {
                queued: false as const,
                reason: 'token-auth-no-cert' as const,
              };
            }

            await addToOfflineQueue({
              tenantId,
              invoiceId,
              // Best-effort: jeśli ostatni błąd to 503, traktujemy jako MF outage
              // (deadline 7 dni zamiast 24h zgodnie ze spec Fazy 11).
              isMfOutage: error.message.includes('503') || error.message.includes('MF'),
            });

            return { queued: true as const };
          } catch (e) {
            return {
              queued: false as const,
              reason: 'offline-queue-error' as const,
              errorMessage: e instanceof Error ? e.message : 'unknown',
            };
          }
        });

        if (offlineResult.queued) {
          finalStatus = 'offline_queued';
          logger.info('Faktura zaparkowana w Offline24 queue po wyczerpaniu retries', {
            tenantId,
            invoiceId,
            attempts: KSEF_MAX_RETRIES + 1,
          });
        } else {
          // Fallback do klasycznego 'failed' gdy Offline24 niedostępne.
          const marked = await step.run('mark-as-failed', () =>
            markFailureUnlessAccepted(
              invoiceId,
              tenantId,
              'failed',
              `${failureMessage} (Offline24 ${offlineResult.reason})`,
            ));
          statusWriteLost = marked === false;
        }
      } else {
        // Standard 'rejected' flow dla NonRetriableError.
        const marked = await step.run('mark-as-rejected', () =>
          markFailureUnlessAccepted(invoiceId, tenantId, 'rejected', failureMessage));
        statusWriteLost = marked === false;
      }

      // Inngest can replay a cached step result, and another worker can
      // accept the invoice after any of the writes above. The current DB
      // state wins over the exhausted job's stale failure classification.
      const afterWrite = await currentSubmissionState(parsed.data);
      if (afterWrite.ksef_status === 'accepted' && afterWrite.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data, true);
        return { handled: true, alreadyAccepted: true, ksefNumber: afterWrite.ksef_number };
      }
      if (statusWriteLost) {
        throw new Error('Nie można potwierdzić stanu faktury po nieudanej wysyłce');
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
            error: failureMessage,
          },
        });
      });

      // An older worker may have completed KSeF after our conditional update.
      // This fresh read avoids a stale failure event in that common race;
      // consumers still verify current state because acceptance can happen later.
      const latest = await currentSubmissionState(parsed.data);
      if (latest.ksef_status === 'accepted' && latest.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data, true);
        return { handled: true, alreadyAccepted: true, ksefNumber: latest.ksef_number };
      }

      await step.sendEvent('emit-failure', {
        name: 'invoice/submit.failed',
        data: {
          invoiceId,
          tenantId,
          error: failureMessage,
          fromOfflineQueue: data.fromOfflineQueue,
          // Bez tego kolejka Offline24 przywracała odrzuconą fakturę do
          // 'queued' i ponawiała ją do upływu terminu.
          terminal: isBusinessRejection || reconcileHold,
          manualReconciliationRequired: reconcileHold,
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
    await requireInvoiceTenant(invoiceId, tenantId);
    const env = (process.env.KSEF_ENV as 'test' | 'demo' | 'production') ?? 'test';
    const fromOfflineQueue = Boolean(parsed.data.fromOfflineQueue);

    // IDEMPOTENCJA (audyt przedlaunchowy): backstop przeciw podwójnej wysyłce.
    // Gdyby ten sam event przyszedł dwa razy (double-click „Wyślij", replay
    // eventu, równoległy enqueue z dwóch instancji), NIE wysyłamy faktury do
    // KSeF drugi raz — jeśli ma już numer KSeF i status 'accepted', zwracamy
    // istniejący wynik. To uzupełnia: deterministyczny generator FA(3) (ten sam
    // XML), idempotencję R2 (HEAD + IfNoneMatch) oraz unikalność numeru P_2 po
    // stronie MF. Trzy niezależne warstwy ochrony przed duplikatem w KSeF.
    const alreadyDone = await step.run('idempotency-guard', async () => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('ksef_status, ksef_number')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error || !data) throw new Error('Nie można sprawdzić statusu faktury');
      return data;
    });
    if (alreadyDone?.ksef_status === 'accepted' && alreadyDone.ksef_number) {
      logger.info('Faktura już zaakceptowana w KSeF — pomijam ponowną wysyłkę', {
        invoiceId,
        ksefNumber: alreadyDone.ksef_number,
      });
      await reconcileAcceptedOfflineQueue(parsed.data);
      return {
        alreadyAccepted: true as const,
        ksefNumber: alreadyDone.ksef_number,
      };
    }

    // Fresh, non-memoized read: an older Inngest idempotency step can be
    // restored after deployment. Check the stored kind as well as the event.
    const current = await currentSubmissionState(parsed.data);
    if (current.ksef_status === 'accepted' && current.ksef_number) {
      await reconcileAcceptedOfflineQueue(parsed.data);
      return { alreadyAccepted: true as const, ksefNumber: current.ksef_number };
    }
    if (isHeldRozSubmission(parsed.data, current)) {
      throw new NonRetriableError(ROZ_SUBMISSION_HOLD_MESSAGE);
    }

    logger.info('Rozpoczynam wysyłkę faktury', {
      tenantId,
      invoiceId,
      nip,
      internalNumber: invoice.internalNumber,
      fromOfflineQueue,
      attempt,
    });

    // Re-emisja po odebraniu z kolejki offline — nie blokuj kolejną sondą zdrowia KSeF,
    // tylko idź klasyczną ścieżką online submit.
    if (!fromOfflineQueue) {
      const health = await step.run('check-ksef-health', async () =>
        shouldUseOfflineMode(env),
      );

      if (health.offline) {
        const redirected = await step.run(
          'try-redirect-offline-queue',
          async (): Promise<boolean> => {
            try {
              await requireKsefVerificationForBackgroundJob(tenantId);
            } catch (e) {
              if (e instanceof KsefNotVerifiedError) {
                throw new NonRetriableError(
                  'Organizacja nie ma zweryfikowanego certyfikatu KSeF — tryb offline nie jest dostępny.',
                  { cause: e },
                );
              }
              throw e;
            }

            const creds = await getTenantKsefCredentials(tenantId);
            if (creds.type !== 'xades') {
              logger.warn('KSeF offline — pomijam kolejkę offline (brak PEM / token)', {
                tenantId,
                invoiceId,
                authType: creds.type,
              });
              return false;
            }

            const current = await currentSubmissionState(parsed.data);
            if ((current.ksef_status === 'accepted' && current.ksef_number) ||
                isHeldRozSubmission(parsed.data, current)) {
              throw new NonRetriableError(ROZ_SUBMISSION_HOLD_MESSAGE);
            }
            await addToOfflineQueue({
              tenantId,
              invoiceId,
              isMfOutage: health.isMfOutage,
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

    // Krok 1.5: pre-flight check KSeF health (Faza 23 sekcja 1+2).
    // Jeśli health monitor wcześniej zaobserwował `down` (3+ consecutive
    // failures lub HTTP 503 z MF), nie spalamy retry-budgetu na zapowiedzianą
    // porażkę — od razu rzucamy RetryAfterError z naszego schedule'a.
    //
    // Dla `attempt === 0` skip — pierwsza próba zawsze powinna sięgnąć
    // KSeF, żeby zweryfikować że monitor nie był stale (TTL Redis 90s).
    if (attempt > 0) {
      const { isKsefHealthy } = await import('@/lib/ksef/health-status');
      const healthy = await step.run('health-check', () => isKsefHealthy(env));
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

    // Krok 2: status 'sending' + timestamp — dopiero gdy wiemy, że job może
    // realnie pogadać z KSeF.
    const markedSending = await step.run('mark-as-sending', async () => {
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await (await createAdminClient())
        .from('invoices')
        .update({
          ksef_status: 'sending',
          submitted_to_ksef_at: now,
          last_attempt_at: now,
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .or('ksef_status.is.null,ksef_status.neq.accepted')
        .select('id')
        .maybeSingle();
      if (updateError) throw new Error('Nie można oznaczyć faktury jako wysyłanej');
      return updated?.id === invoiceId;
    });
    // Pre-hotfix Inngest checkpoints stored `undefined` for this step. Only
    // explicit false from the new conditional update denotes a lost race.
    if (markedSending === false) {
      const latest = await currentSubmissionState(parsed.data);
      if (latest.ksef_status === 'accepted' && latest.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data);
        return { alreadyAccepted: true as const, ksefNumber: latest.ksef_number };
      }
      throw new Error('Nie można potwierdzić statusu faktury przed wysyłką');
    }

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
    // Ten step ma własny retry — błąd sieciowy retryuje TYLKO jego, nie
    // wcześniejszych (status w DB już 'sending'). Przy retry credentials
    // wczytamy ponownie z DB — koszt: jeden dodatkowy SELECT + decrypt,
    // zysk: brak wycieku PEM-a do zewnętrznego storage'u.
    // Krok 2.5 (AUD-01): jeśli wcześniejsza próba dotarła do KSeF (mamy jej
    // numery referencyjne), pytamy o status TEJ wysyłki zamiast wysyłać fakturę
    // drugi raz. Bez tego timeout pollingu, 5xx albo padnięty worker kończyły
    // się ponowną wysyłką, odpowiedzią 440 i fałszywym „odrzucona”.
    const reconciled = await step.run('reconcile-previous-submission', async (): Promise<SubmitOutcome | null> => {
      const previous = await findOpenKsefSubmission(tenantId, invoiceId);
      if (!previous) return null;
      const credentials = await getTenantKsefCredentials(tenantId);
      try {
        const status = await checkInvoiceStatusByReference(previous, credentials, env, {
          tenantId,
          invoiceId,
        });
        if (status.state === 'processing') {
          throw new RetryAfterError(
            'KSeF nadal przetwarza wcześniejszą wysyłkę tej faktury — czekam zamiast wysyłać ponownie',
            getKsefRetryDelay(attempt),
          );
        }
        return {
          ksefNumber: status.ksefNumber,
          acquisitionTimestamp: status.acquisitionTimestamp,
          xmlStoragePath: invoiceXmlKey(tenantId, invoiceId, invoice.issueDate),
          sessionReferenceNumber: previous.sessionReferenceNumber,
          invoiceReferenceNumber: previous.invoiceReferenceNumber,
          via: 'reference-reconcile',
        };
      } catch (error) {
        if (error instanceof RetryAfterError) throw error;
        if (error instanceof KsefInvoiceRejectedError && !error.isDuplicate) {
          await markKsefSubmission({
            tenantId,
            invoiceId,
            invoiceReferenceNumber: previous.invoiceReferenceNumber,
            status: 'rejected',
            errorCode: String(error.code),
            errorMessage: error.message,
          });
          throw new NonRetriableError(error.message, { cause: error });
        }
        if (error instanceof KsefApiError && error.status === 401) {
          ksefSessionCache.invalidate(credentials.nip, env);
        }
        // Awaria łącza albo KSeF: ponawiamy UZGADNIANIE, nigdy wysyłkę.
        throw new RetryAfterError(
          `Uzgadnianie wcześniejszej wysyłki KSeF nieudane: ${error instanceof Error ? error.message : 'nieznany błąd'}`,
          getKsefRetryDelay(attempt),
          { cause: error instanceof Error ? error : undefined },
        );
      }
    });

    const result: SubmitOutcome = reconciled ?? await step.run('submit-to-ksef', async (): Promise<SubmitOutcome> => {
      const current = await currentSubmissionState(parsed.data);
      if ((current.ksef_status === 'accepted' && current.ksef_number) ||
          isHeldRozSubmission(parsed.data, current)) {
        throw new NonRetriableError(ROZ_SUBMISSION_HOLD_MESSAGE);
      }
      const credentials = await getTenantKsefCredentials(tenantId);

      try {
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
        return { ...submitted, via: 'submit' };
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
        // 401: wygasła sesja z pamięci podręcznej — to nie odrzucenie faktury.
        // Ponowienie zacznie od uzgodnienia, jeśli plik zdążył dotrzeć do KSeF.
        if (error instanceof KsefApiError && error.status === 401) {
          ksefSessionCache.invalidate(credentials.nip, env);
          throw new RetryAfterError(
            'Sesja KSeF wygasła — ponowię z nową sesją',
            getKsefRetryDelay(attempt),
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
        if (error instanceof KsefInvoiceRejectedError && error.isDuplicate) {
          // 440: KSeF ma już fakturę o tym numerze. Jeśli to NASZA wcześniejsza
          // wysyłka tej faktury (numer sesji z odpowiedzi jest w historii),
          // przyjmujemy jej numer KSeF zamiast oznaczać fakturę jako odrzuconą.
          const ownSession =
            error.originalKsefNumber && error.originalSessionReferenceNumber
              ? await isOwnKsefSession(tenantId, invoiceId, error.originalSessionReferenceNumber)
              : false;
          if (ownSession && error.originalKsefNumber && error.originalSessionReferenceNumber) {
            return {
              ksefNumber: error.originalKsefNumber,
              xmlStoragePath: invoiceXmlKey(tenantId, invoiceId, invoice.issueDate),
              sessionReferenceNumber: error.originalSessionReferenceNumber,
              via: 'own-duplicate',
            };
          }
          Sentry.captureException(error, {
            tags: { job: 'submit-invoice', kind: 'ksef-duplicate' },
            extra: { tenantId, invoiceId, ksefStatusCode: error.code, originalKsefNumber: error.originalKsefNumber },
          });
          // Nie wiemy, czyja to faktura — do uzgodnienia, nie „odrzucona”.
          throw new NonRetriableError(`[${KSEF_DUPLICATE_RECONCILE}] ${error.message}`, { cause: error });
        }
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
          throw new NonRetriableError(error.message, { cause: error });
        }
        // Retry-owalne — 5xx, 429, timeout, ECONNRESET. Zamiast pozwolić
        // Inngestowi użyć defaultowego exponential backoff (10s/30s/1m/5m/15m),
        // rzucamy `RetryAfterError` z naszym custom schedule:
        // 30s → 2min → 5min → 15min → 1h (Faza 23 sekcja 2).
        //
        // KsefApiError 429 może mieć `Retry-After` header — jeśli MF mówi
        // nam konkretnie ile czekać, słuchamy. Inaczej trzymamy się schedule'a.
        const customDelay = getKsefRetryDelay(attempt);
        const isKsefApi = error instanceof KsefApiError;
        const errorLabel = isKsefApi
          ? `KSeF HTTP ${error.status}: ${error.message}`
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'Nieznany błąd';

        logger.warn('Retry-owalny błąd KSeF — planuję ponowną próbę', {
          tenantId,
          invoiceId,
          attempt,
          maxRetries: KSEF_MAX_RETRIES,
          retryAfter: customDelay,
          errorLabel,
        });

        Sentry.addBreadcrumb({
          category: 'ksef.submit',
          level: 'warning',
          message: 'KSeF retry scheduled',
          data: { tenantId, invoiceId, attempt, retryAfter: customDelay, errorLabel },
        });

        throw new RetryAfterError(errorLabel, customDelay, {
          cause: error instanceof Error ? error : undefined,
        });
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
      }, tenantId);

      // Historia prób: wpis zamykamy po zapisie akceptacji. Fail-soft — błąd tu
      // nie może cofnąć akceptacji ani zablokować zdarzenia UPO niżej.
      if (result.invoiceReferenceNumber) {
        try {
          await markKsefSubmission({
            tenantId,
            invoiceId,
            invoiceReferenceNumber: result.invoiceReferenceNumber,
            status: 'accepted',
            ksefNumber: result.ksefNumber,
          });
        } catch (e) {
          logger.warn('Nie zamknięto wpisu historii wysyłki KSeF', {
            invoiceId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Faza 22: faktura zaakceptowana → dashboard KPI się zmieniają.
      // Czyścimy cache żeby user widział świeży count zamiast czekać na 5min TTL.
      const { invalidateTenantDashboard } = await import('@/lib/cache/invalidation');
      await invalidateTenantDashboard(tenantId);
    });

    await step.run('analytics-invoice-accepted', async () => {
      await trackServer({
        distinctId: tenantId,
        event: ANALYTICS_EVENTS.invoiceAccepted,
        properties: {
          ksef_env: process.env.KSEF_ENV ?? 'test',
          internal_number: invoice.internalNumber ?? null,
        },
      });
    });

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
        // KSeF 2.0 trzyma UPO w zasobach sesji (AUD-17).
        sessionReferenceNumber: result.sessionReferenceNumber,
      },
    });

    await step.run('audit-success', async () => {
      await logAuditSystem({
        action: 'invoice.submit_succeeded',
        tenantId,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { ksefNumber: result.ksefNumber, via: result.via },
      });
    });

    await step.sendEvent('emit-success', {
      name: 'invoice/submit.succeeded',
      data: {
        invoiceId,
        tenantId,
        ksefNumber: result.ksefNumber,
        fromOfflineQueue: data.fromOfflineQueue,
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
