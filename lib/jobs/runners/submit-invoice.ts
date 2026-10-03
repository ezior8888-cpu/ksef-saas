import { assertJobIdentity, requireInvoiceTenant } from './tenant-boundary';
import * as Sentry from '@sentry/nextjs';
import { NonRetriableError, RetryAfterError } from '../errors';
import type { JobContext } from '@/lib/jobs/registry';
import type { KsefEnvironment } from '@/types/ksef';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { logAuditSystem } from '@/lib/audit/log-system';
import { invoiceSubmitRequested } from '../events';
import { submitInvoiceFullFlow } from '@/lib/ksef/submit-invoice-full';
import { assertSubmitReferences } from '@/lib/ksef/submit-reference-boundary';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import {
  KsefNotVerifiedError,
  requireKsefVerificationForBackgroundJob,
} from '@/lib/auth/ksef-verification-guard';
import {
  getTenantKsefCredentials,
  KsefCredentialsError,
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
import {
  heldErrorMessage,
  isCorrectionHeldForEnv,
  isCorrectionSubmission,
  isKsefSubmissionPaused,
  KOR_HOLD,
  KSEF_PAUSED,
} from '@/lib/ksef/submission-holds';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { isOffline24Enabled } from '@/lib/ksef/offline24-policy';
import { recordXmlDocument } from '@/lib/storage/xml-documents';
import { InvoiceXmlSchemaError } from '@/lib/xml/validator';
import { isRozSubmission, ROZ_SUBMISSION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import { InvoiceValidationError } from '@/lib/xml/fa3-generator';
import {
  classifySendError,
  isContentRejection,
  SEND_ERROR_CODES,
  type SendErrorCode,
} from '@/lib/ksef/send-error-codes';
import {
  getKsefRetryDelay,
  ksefRetryDelayFor,
  KSEF_MAX_RETRIES,
} from '../retry-schedule';

/**
 * Odpowiedź 440 „duplikat”, której NIE da się przypisać do naszej wcześniejszej
 * wysyłki tej faktury (inny numer sesji albo brak historii). KSeF wykrywa
 * duplikat po numerze faktury sprzedawcy, a ten numer mógł zostać użyty poza
 * FaktFlow — przypięcie cudzego numeru KSeF byłoby błędnym zapisem prawnym.
 * Stan neutralny „do uzgodnienia” (jak wstrzymana ROZ), bez komunikatu
 * „odrzucona”. Znacznik w treści błędu, bo przechodzi przez oba backendy jobów.
 */
export const KSEF_DUPLICATE_RECONCILE = SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE;

/** Znacznik `[KOD] ` na początku treści błędu — do zdjęcia przed zapisem `last_error`. */
const HOLD_MARKER = /^\[[A-Z_]+\] /;

/** Wynik wysyłki niezależnie od drogi: nowa wysyłka, uzgodnienie albo własny duplikat. */
interface SubmitOutcome {
  ksefNumber: string;
  xmlStoragePath: string;
  /** Znane przy świeżej wysyłce; przy uzgodnieniu liczone z pliku w magazynie. */
  xmlSha256Hash?: string;
  xmlSizeBytes?: number;
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
 * - Błędy treści (XSD, odrzucenie przez KSeF) — `NonRetriableError`, po
 *   `onExhausted` faktura `rejected`; inne błędy bez ponowień (strażnik
 *   dokumentu, brak certyfikatu) kończą jako `failed` z kodem z katalogu
 *   `ksef_error_codes` (`lib/ksef/send-error-codes.ts`).
 *
 * Concurrency + throttle (Faza 23 sekcja 2):
 * - Per-tenant concurrency: max 100 równoległych submit'ów. Wyższy limit
 *   per-tenant (vs poprzednie 3 per-NIP) dla dużych tenantów z 1000+ fakturami
 *   miesięcznie; rate-limiter per-NIP wewnątrz KSeF clienta i tak zatrzyma
 *   nadmiar.
 * - Per-tenant throttle: 60 wysyłek/min — chroni MF przed zalaniem przy
 *   bulk import, nawet jeśli concurrency 100 da chwilowy spike.
 */

/**
 * Dzierżawa przejęcia wysyłki (AUD-10): dłuższa niż najdłuższa wysyłka
 * z odpytywaniem statusu; tyle samo co próg alarmu „faktura w sending”.
 */
export const KSEF_SEND_LEASE_SECONDS = 15 * 60;
/** Gdy wysyłkę trzyma inna próba — ponowienie po 5 min (wynik albo koniec dzierżawy). */
export const KSEF_SEND_CLAIM_RETRY_MS = 5 * 60 * 1000;

const ROZ_RECONCILIATION_MESSAGE =
  'Wysyłka faktury rozliczającej została wstrzymana. Przed kolejną próbą ręcznie uzgodnij jej status z KSeF.';

/** Fresh DB read outside Inngest steps, including the accepted status. */
async function currentSubmissionState(
  data: { invoiceId: string; tenantId: string },
): Promise<{
  direction: string | null;
  ksef_status: string | null;
  ksef_number: string | null;
  ksef_environment: string | null;
  invoice_type: string | null;
  invoice_kind: string | null;
}> {
  const { data: stored, error } = await (await createAdminClient())
    .from('invoices')
    .select('direction, ksef_status, ksef_number, ksef_environment, invoice_type, invoice_kind')
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

/**
 * Hamulce (krok 5): korekty na KSeF produkcyjnym i globalny wyłącznik.
 * Rzuca neutralny NonRetriableError ze znacznikiem; odczyt wyłącznika jest
 * autorytatywny, więc awaria bazy kończy się ponowieniem, nie wysyłką.
 */
async function assertSubmissionNotHeld(
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  stored: Awaited<ReturnType<typeof currentSubmissionState>>,
  env: 'test' | 'demo' | 'production',
): Promise<void> {
  if (
    isCorrectionHeldForEnv(env) &&
    isCorrectionSubmission({
      invoiceType: data.invoice.type,
      storedInvoiceType: stored.invoice_type,
      invoiceKind: stored.invoice_kind,
      correctionData: data.correctionData,
    })
  ) {
    throw new NonRetriableError(heldErrorMessage(KOR_HOLD));
  }
  if (await isKsefSubmissionPaused()) {
    throw new NonRetriableError(heldErrorMessage(KSEF_PAUSED));
  }
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

/**
 * Zapis wyniku porażki (I4 z cyklu życia faktury): zawsze z kodem z katalogu
 * `ksef_error_codes` i ze zwolnionym przejęciem (`ksef_send_owner`), żeby
 * ponowienie przez `requeue_ksef_send` nie trafiło na cudzą dzierżawę.
 * Warunkowo — równoległa akceptacja innego workera wygrywa.
 */
async function markFailureUnlessAccepted(
  invoiceId: string,
  tenantId: string,
  status: 'failed' | 'rejected',
  lastError: string,
  code: SendErrorCode,
): Promise<boolean> {
  const { data: updated, error } = await (await createAdminClient())
    .from('invoices')
    .update({
      ksef_status: status,
      last_error: lastError,
      last_error_code: code,
      last_error_field: null,
      last_error_suggestion: null,
      ksef_send_owner: null,
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
 * W1: błąd poświadczeń ≠ odrzucenie przez KSeF.
 *   - brak certyfikatu / NIP niezweryfikowany → bez ponowień (klient uzupełnia
 *     ustawienia; kod `NO_CERTIFICATE` / `NOT_VERIFIED`),
 *   - klucz szyfrowania / NIP z szyfrogramu → ponowienie z alarmem operatora
 *     (`CREDENTIALS_UNAVAILABLE`),
 *   - błąd odczytu bazy → zwykłe ponowienie wg harmonogramu (`INFRA`).
 * Do 03.10.2026 każdy z nich kończył fakturę jako „odrzucona przez KSeF”.
 */
function credentialsFailure(
  e: unknown,
  ctx: { tenantId: string; invoiceId: string; attempt: number },
): Error {
  if (e instanceof KsefCredentialsError) {
    switch (e.reason) {
      case 'missing':
      case 'not-verified':
        return new NonRetriableError(`Nie można użyć credentials KSeF: ${e.message}`, { cause: e });
      case 'decrypt':
      case 'nip-mismatch':
        Sentry.captureMessage('Poświadczenia KSeF firmy nie nadają się do użycia — sprawdź klucz szyfrowania', {
          level: 'error',
          tags: { job: 'submit-invoice', kind: 'credentials' },
          extra: { ...ctx, reason: e.reason },
        });
        return new RetryAfterError(
          `Poświadczenia KSeF chwilowo niedostępne: ${e.message}`,
          getKsefRetryDelay(ctx.attempt),
          { cause: e },
        );
      default:
        return e;
    }
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * S1: rozstrzygnięcie w statusie (odrzucenie, duplikat) zamyka otwarty wpis
 * `ksef_submissions` tej wysyłki. Bez tego każda kolejna próba „uzgadniała”
 * zakończoną sesję, a `ksef_has_contact_evidence` liczyła ją jako kontakt.
 * Fail-soft: wpis to historia, nie decyzja o fakturze.
 */
async function closeOpenSubmission(
  tenantId: string,
  invoiceId: string,
  status: 'rejected' | 'duplicate',
  error: KsefInvoiceRejectedError,
  logger: JobContext['logger'],
): Promise<void> {
  try {
    const open = await findOpenKsefSubmission(tenantId, invoiceId);
    if (!open) return;
    await markKsefSubmission({
      tenantId,
      invoiceId,
      invoiceReferenceNumber: open.invoiceReferenceNumber,
      status,
      errorCode: String(error.code),
      errorMessage: error.message,
    });
  } catch (e) {
    logger.warn('Nie zamknięto wpisu historii wysyłki KSeF po rozstrzygnięciu', {
      invoiceId,
      status,
      error: e instanceof Error ? e.message : String(e),
    });
    Sentry.captureException(e, { tags: { area: 'ksef.submission-log' }, extra: { invoiceId, status } });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identyfikatory z surowego payloadu — żeby zły payload nie zostawił faktury bez śladu (W3). */
function rawIds(data: unknown): { invoiceId: string; tenantId: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { invoiceId, tenantId } = data as { invoiceId?: unknown; tenantId?: unknown };
  if (typeof invoiceId !== 'string' || typeof tenantId !== 'string') return null;
  if (!UUID_RE.test(invoiceId) || !UUID_RE.test(tenantId)) return null;
  return { invoiceId, tenantId };
}

/**
 * Alarm operatora dla porażek bez wyjątku w Sentry: `ignoreErrors` filtruje
 * `NonRetriableError`, a te ścieżki kończą się zwykłym `return`.
 */
function alertReconcile(message: string, extra: Record<string, unknown>): void {
  Sentry.captureMessage(message, {
    level: 'error',
    tags: { job: 'submit-invoice', kind: 'reconcile' },
    extra,
  });
}

/**
 * Obsługa po wyczerpaniu prób (Etap 7) — pg-boss `onExhausted`.
 *
 * Jedna klasyfikacja: `classifySendError` (katalog `ksef_error_codes`, 00131).
 * Klasa kodu wyznacza stan końcowy:
 *   - terminal + odrzucenie treści (XSD, KSeF)  → `rejected`,
 *   - terminal (strażnik dokumentu)             → `failed`, bez ponowień,
 *   - transient                                 → Offline24 (tylko KSeF TEST,
 *     dokument zwykły, certyfikat) albo `failed` — cron cyklu życia ponawia,
 *   - hold / reconcile                          → `failed` „do uzgodnienia”,
 *   - setup                                     → `failed`, klient uzupełnia
 *     ustawienia KSeF.
 * Każdy zapis niesie kod i zwalnia przejęcie (I4). Nic nie kończy się cichym
 * `return` bez śladu w bazie albo w Sentry (W3).
 */
export async function onSubmitInvoiceExhausted(
  error: Error,
  data: Parameters<typeof invoiceSubmitRequested.create>[0],
  { step, logger }: JobContext,
) {
      const parsed = invoiceSubmitRequested.safeParse(data);
      if (!parsed.success) {
        const ids = rawIds(data);
        logger.error('KSeF submit event invalid; invoice requires reconciliation', {
          reason: 'invalid-payload',
          ...ids,
        });
        alertReconcile('KSeF submit event invalid — invoice marked INVALID_EVENT', {
          ...ids,
          issues: parsed.error.issues.slice(0, 3),
        });
        if (!ids) return { handled: false as const, reason: 'invalid-payload' as const };
        const state = await currentSubmissionState(ids);
        if (state.direction !== 'outgoing' || state.ksef_status === 'accepted') {
          return { handled: false as const, reason: 'invalid-payload' as const };
        }
        const marked = await step.run('mark-as-failed-invalid-event', () =>
          markFailureUnlessAccepted(
            ids.invoiceId,
            ids.tenantId,
            'failed',
            'Zdarzenie wysyłki jest niekompletne — wymaga uzgodnienia przez operatora.',
            SEND_ERROR_CODES.INVALID_EVENT,
          ));
        return marked
          ? { handled: true as const, finalStatus: 'failed' as const, reason: 'invalid-payload' as const }
          : { handled: false as const, reason: 'invalid-payload' as const };
      }
      const { tenantId, invoiceId, nip, invoice } = parsed.data;
      await requireInvoiceTenant(invoiceId, tenantId);
      const fromOfflineQueue = Boolean(data.fromOfflineQueue);
      const current = await currentSubmissionState(parsed.data);
      // Faktura przychodząca nie jest wysyłana — zdarzenie o niej to błąd albo
      // podróbka; stanu nie zmieniamy (#71, Codex), ale operator ma wiedzieć.
      if (current.direction === 'incoming') {
        logger.error('KSeF submit failure callback targets an incoming invoice; no invoice state changed', {
          invoiceId,
        });
        alertReconcile('KSeF submit failure callback targets an incoming invoice', { tenantId, invoiceId });
        return { handled: false as const, reason: 'invoice-direction-mismatch' as const };
      }
      if (current.ksef_status === 'accepted') {
        if (current.ksef_number && current.ksef_environment === parsed.data.environment) {
          await reconcileAcceptedOfflineQueue(parsed.data, true);
          return { handled: true as const, alreadyAccepted: true as const, ksefNumber: current.ksef_number };
        }
        logger.error('KSeF accepted invoice was not changed by failed submit callback; manual reconciliation required', {
          invoiceId,
          eventEnvironment: parsed.data.environment,
          storedEnvironment: current.ksef_environment ?? null,
        });
        alertReconcile('KSeF accepted invoice from another environment hit the failure callback', {
          tenantId,
          invoiceId,
          eventEnvironment: parsed.data.environment,
          storedEnvironment: current.ksef_environment ?? null,
        });
        return { handled: false as const, reason: 'accepted-reconciliation' as const };
      }
      // Zdarzenie z innego środowiska KSeF niż skonfigurowane (#63, Codex):
      // faktura dostaje kod `ENV_MISMATCH` (klasa reconcile) zamiast zostać
      // w `queued`/`sending` na zawsze (W3). Dalej decyduje operator.
      const configuredEnv = configuredKsefEnvironment();
      if (parsed.data.environment !== configuredEnv) {
        logger.error('KSeF submit event environment mismatch; invoice requires reconciliation', {
          tenantId,
          invoiceId,
          eventEnvironment: parsed.data.environment,
          configuredEnvironment: configuredEnv,
        });
        alertReconcile('KSeF submit event environment mismatch — invoice marked ENV_MISMATCH', {
          tenantId,
          invoiceId,
          eventEnvironment: parsed.data.environment,
          configuredEnvironment: configuredEnv,
        });
        const marked = await step.run('mark-as-failed-env-mismatch', () =>
          markFailureUnlessAccepted(
            invoiceId,
            tenantId,
            'failed',
            'Zdarzenie wysyłki pochodzi z innego środowiska KSeF niż skonfigurowane — wymaga uzgodnienia przez operatora.',
            SEND_ERROR_CODES.ENV_MISMATCH,
          ));
        return marked
          ? { handled: true as const, finalStatus: 'failed' as const, reason: 'environment-mismatch' as const }
          : { handled: false as const, reason: 'environment-mismatch' as const };
      }

      // Klasyfikacja — jedno miejsce (W1, S1): błąd po naszej stronie nigdy
      // nie udaje odrzucenia przez KSeF. Blokada ROZ wynika ze stanu w bazie,
      // nie z treści błędu.
      const heldRoz = isHeldRozSubmission(parsed.data, current);
      const classified = heldRoz
        ? { code: SEND_ERROR_CODES.ROZ_HOLD_RECONCILE, class: 'hold' as const }
        : classifySendError(error);
      const { code } = classified;
      // Hamulec, blokada albo niepewny wynik: stan „do uzgodnienia” — bez
      // komunikatu „odrzucona”, bez Offline24.
      const reconcileHold = classified.class === 'hold' || classified.class === 'reconcile';
      // `rejected` TYLKO dla błędu treści potwierdzonego przez XSD albo KSeF.
      const isBusinessRejection = classified.class === 'terminal' && isContentRejection(code);
      // Ponowienie ma sens (awaria, limit, sesja) — jedyna droga do Offline24.
      const isTransientFailure = classified.class === 'transient';
      const failureMessage = heldRoz
        ? ROZ_RECONCILIATION_MESSAGE
        : HOLD_MARKER.test(error.message)
          ? error.message.replace(HOLD_MARKER, '')
          : `${error.name}: ${error.message}`;

      logger.error('Job wysyłki padł — klasyfikacja błędu', {
        tenantId,
        invoiceId,
        nip,
        internalNumber: invoice.internalNumber,
        errorName: error.name,
        errorMessage: error.message,
        code,
        errorClass: classified.class,
        heldRoz,
        isBusinessRejection,
        isTransientFailure,
        fromOfflineQueue,
      });

      let finalStatus: 'rejected' | 'failed' | 'offline_queued' = isBusinessRejection
        ? 'rejected'
        : 'failed';
      let marked = true;

      if (isTransientFailure && !fromOfflineQueue) {
        // Faza 23 sekcja 3: po wyczerpaniu ponowień z błędem przejściowym →
        // parking w Offline24 (`addToOfflineQueue` ustawia `offline_queued`).
        // QR II wymaga odrębnego certyfikatu KSeF typu Offline; kolejka nie
        // zapisuje kodów na podstawie certyfikatu uwierzytelniania.
        const offlineResult = await step.run('try-offline-queue', async () => {
          // AUD-14: na produkcji nie parkujemy — `failed` z kodem, ponawia cron.
          const ksefEnv = (process.env.KSEF_ENV as KsefEnvironment | undefined) ?? 'test';
          if (!isOffline24Enabled(ksefEnv)) {
            return { queued: false as const, reason: 'offline24-wylaczony-na-produkcji' as const };
          }
          // Offline24 zapisuje tylko id faktury — korekty, zaliczki i ROZ nie
          // da się z niego odtworzyć (#63, Codex).
          if (current.invoice_kind !== 'regular') {
            return { queued: false as const, reason: 'dokument-specjalny' as const };
          }
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
          marked = await step.run('mark-as-failed', () =>
            markFailureUnlessAccepted(
              invoiceId,
              tenantId,
              'failed',
              `${failureMessage} (Offline24 ${offlineResult.reason})`,
              code,
            ));
        }
      } else {
        // Jeden warunkowy zapis dla: odrzucenia treści (`rejected`), strażnika
        // dokumentu, hamulców i blokad, braku certyfikatu oraz powrotu
        // z Offline24 (`failed`). Równoległa akceptacja innego workera wygrywa.
        const stepName = heldRoz
          ? 'mark-as-failed-roz-hold'
          : reconcileHold
            ? 'mark-as-neutral-hold'
            : fromOfflineQueue
              ? 'mark-as-failed-from-offline'
              : isBusinessRejection
                ? 'mark-as-rejected'
                : 'mark-as-failed';
        marked = await step.run(stepName, () =>
          markFailureUnlessAccepted(
            invoiceId,
            tenantId,
            isBusinessRejection ? 'rejected' : 'failed',
            failureMessage,
            code,
          ));
      }

      // Inny worker mógł przyjąć fakturę po którymkolwiek zapisie wyżej —
      // bieżący stan w bazie wygrywa z nieaktualną klasyfikacją porażki.
      const afterWrite = await currentSubmissionState(parsed.data);
      if (afterWrite.ksef_status === 'accepted' && afterWrite.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data, true);
        return { handled: true as const, alreadyAccepted: true as const, ksefNumber: afterWrite.ksef_number };
      }
      if (!marked) {
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
            errorCode: code,
            errorClass: classified.class,
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
        return { handled: true as const, alreadyAccepted: true as const, ksefNumber: latest.ksef_number };
      }

      await step.sendEvent('emit-failure', {
        name: 'invoice/submit.failed',
        data: {
          invoiceId,
          tenantId,
          error: failureMessage,
          errorCode: code,
          environment: parsed.data.environment,
          fromOfflineQueue: data.fromOfflineQueue,
          offlineQueueId: parsed.data.offlineQueueId,
          // Bez tego kolejka Offline24 przywracała odrzuconą fakturę do
          // 'queued' i ponawiała ją do upływu terminu. Wszystko poza błędem
          // przejściowym zamyka stary wpis Offline24 (#63).
          terminal: !isTransientFailure,
          manualReconciliationRequired: reconcileHold,
        },
      });

      return { handled: true as const, finalStatus, fromOfflineQueue };
}

/**
 * Runner joba (worker pg-boss).
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
    // Zdarzenie musi pochodzić z tego samego środowiska KSeF, które jest
    // skonfigurowane — inaczej faktura trafiłaby do innego KSeF (#63, Codex).
    const env = configuredKsefEnvironment();
    if (!env || parsed.data.environment !== env) {
      throw new NonRetriableError('KSeF submit event environment does not match configured environment');
    }
    // Automatyczny Offline24 wstrzymany (decyzja 02.10.2026, #71): zdarzenie
    // z kolejki offline to stary wpis — tylko ręczne uzgodnienie.
    if (parsed.data.fromOfflineQueue) {
      throw new NonRetriableError('Offline24 automatic replay requires manual reconciliation');
    }
    await requireInvoiceTenant(invoiceId, tenantId);
    const fromOfflineQueue = Boolean(parsed.data.fromOfflineQueue);
    if (fromOfflineQueue) {
      assertJobIdentity(parsed.data.offlineQueueId, tenantId);
      const { data: queueRow, error: queueError } = await (await createAdminClient())
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
    const alreadyDone = await step.run('idempotency-guard', async () => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('ksef_status, ksef_number, ksef_environment')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error || !data) throw new Error('Nie można sprawdzić statusu faktury');
      return data;
    });
    if (alreadyDone?.ksef_status === 'accepted' && alreadyDone.ksef_number &&
        alreadyDone.ksef_environment === env) {
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
    if (current.direction === 'incoming') {
      throw new NonRetriableError('KSeF incoming invoice requires manual reconciliation');
    }
    if (current.ksef_status === 'accepted' && current.ksef_environment !== env) {
      logger.error('KSeF accepted invoice environment requires manual reconciliation', {
        invoiceId,
        environment: env,
        storedEnvironment: current.ksef_environment ?? null,
      });
      throw new NonRetriableError('KSeF accepted invoice environment requires manual reconciliation');
    }
    if (current.ksef_status === 'accepted' && current.ksef_number) {
      await reconcileAcceptedOfflineQueue(parsed.data);
      return { alreadyAccepted: true as const, ksefNumber: current.ksef_number };
    }
    if (isHeldRozSubmission(parsed.data, current)) {
      throw new NonRetriableError(ROZ_SUBMISSION_HOLD_MESSAGE);
    }
    // Przed sondą zdrowia i Offline24 — wstrzymanej faktury nie wolno też zaparkować.
    await assertSubmissionNotHeld(parsed.data, current, env);

    // Odwołania dokumentu specjalnego (rodzic korekty, zaliczki ROZ) muszą
    // wskazywać faktury tej firmy przyjęte w tym środowisku KSeF (#63, Codex).
    const documentKind = await assertSubmitReferences({
      supabase: await createAdminClient(),
      tenantId,
      invoiceId,
      invoice,
      environment: env,
      correctionData: parsed.data.correctionData,
      advanceData: parsed.data.advanceData,
      finalData: parsed.data.finalData,
      finalAdvanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
    });

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
    // AUD-14: na KSeF produkcyjnym bez automatycznego Offline24
    // (`offline24-policy.ts`) — gdy KSeF nie odpowiada, zadziała zwykłe
    // ponowienie po sondzie zdrowia przed wysyłką.
    if (!fromOfflineQueue && isOffline24Enabled(env)) {
      const health = await step.run('check-ksef-health', async () =>
        shouldUseOfflineMode(env),
      );

      if (health.offline) {
        if (documentKind !== 'regular') {
          throw new RetryAfterError(
            'KSeF unavailable; special invoice cannot be replayed from Offline24',
            getKsefRetryDelay(attempt),
          );
        }
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

    // Krok 1: walidacja credentials PRZED `sending` — brak certyfikatu kończy
    // bez ponowień (`failed NO_CERTIFICATE`), błąd bazy albo klucza jest
    // ponawiany (W1) — zanim status przejdzie na `sending`.
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
        throw credentialsFailure(e, { tenantId, invoiceId, attempt });
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

    // Krok 2: przejęcie wysyłki (AUD-10, 00124) — `sending` z wyłącznością.
    // Wygrywa, gdy faktura jest wolna, gdy trzyma ją ta sama próba (ponowienie
    // tego samego zdarzenia) albo gdy dzierżawa innej próby wygasła. Ponowienie
    // najpierw uzgadnia poprzednią wysyłkę po numerze referencyjnym (C-18).
    const claimed = await step.run('mark-as-sending', async (): Promise<boolean> => {
      const { data, error: claimError } = await (await createAdminClient()).rpc('claim_ksef_send', {
        p_invoice_id: invoiceId,
        p_tenant_id: tenantId,
        p_owner: parsed.data.sendAttemptId ?? null,
        p_lease_seconds: KSEF_SEND_LEASE_SECONDS,
      });
      if (claimError) throw new Error('Nie można przejąć wysyłki faktury');
      return typeof data === 'string' && data.length > 0;
    });
    // Starsze punkty kontrolne Inngest zapisały tu `undefined` — tylko jawne
    // `false` oznacza, że wysyłkę trzyma inna próba.
    if (claimed === false) {
      const latest = await currentSubmissionState(parsed.data);
      if (latest.ksef_status === 'accepted' && latest.ksef_number) {
        await reconcileAcceptedOfflineQueue(parsed.data);
        return { alreadyAccepted: true as const, ksefNumber: latest.ksef_number };
      }
      logger.warn('Wysyłkę faktury prowadzi inna próba — czekam na jej wynik albo koniec dzierżawy', {
        invoiceId,
        attempt,
      });
      // S22: to oczekiwanie, nie porażka — nie zużywa próby z `maxRetries`.
      throw new RetryAfterError(
        'Wysyłkę tej faktury prowadzi inna próba — ponowię po jej wyniku',
        KSEF_SEND_CLAIM_RETRY_MS,
        { countsAsAttempt: false },
      );
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
          // S22: oczekiwanie na wynik KSeF nie zużywa próby.
          throw new RetryAfterError(
            'KSeF nadal przetwarza wcześniejszą wysyłkę tej faktury — czekam zamiast wysyłać ponownie',
            getKsefRetryDelay(attempt),
            { countsAsAttempt: false },
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
      // Ponownie tuż przed wysyłką: wyłącznik mógł zostać włączony między krokami.
      await assertSubmissionNotHeld(parsed.data, current, env);
      await assertSubmitReferences({
        supabase: await createAdminClient(),
        tenantId,
        invoiceId,
        invoice,
        environment: env,
        correctionData: parsed.data.correctionData,
        advanceData: parsed.data.advanceData,
        finalData: parsed.data.finalData,
        finalAdvanceSettlementRows: parsed.data.finalAdvanceSettlementRows,
      });
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
        // AUD-13: KSeF nigdy nie przyjmie XML-a niezgodnego z XSD — ponowienia
        // i Offline24 tylko odsuwały komunikat o błędzie o kilka dni.
        if (error instanceof InvoiceXmlSchemaError) {
          throw new NonRetriableError(
            `Faktura nie przeszła walidacji schematu FA(3): ${error.errors.slice(0, 3).join('; ')}`,
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
          // Ta wysyłka zakończyła się duplikatem — zamykamy JEJ wpis (S1).
          await closeOpenSubmission(tenantId, invoiceId, 'duplicate', error, logger);
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
          // Odrzucenie w statusie zamyka wpis historii tej wysyłki (S1).
          await closeOpenSubmission(tenantId, invoiceId, 'rejected', error, logger);
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
        // nam konkretnie ile czekać, słuchamy (AUD-92). Inaczej harmonogram.
        const customDelay = ksefRetryDelayFor(error, attempt);
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
        ksef_environment: env,
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

      // AUD-12: wiersz xml_documents (PDF z kodem KOD I, „Pobierz XML”, portal
      // księgowej). Fail-soft jak historia wysyłki — akceptacji nie cofamy,
      // brak wiersza widać w Sentry.
      try {
        await recordXmlDocument({
          tenantId,
          invoiceId,
          storagePath: result.xmlStoragePath,
          sha256Hash: result.xmlSha256Hash,
          sizeBytes: result.xmlSizeBytes,
        });
      } catch (e) {
        logger.error('Nie zapisano xml_documents dla przyjętej faktury', {
          invoiceId,
          error: e instanceof Error ? e.message : String(e),
        });
        Sentry.captureException(e, { tags: { area: 'ksef.xml-documents' }, extra: { invoiceId } });
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
          ksef_env: env,
          internal_number: invoice.internalNumber ?? null,
        },
      });
    });

    await step.sendEvent('trigger-upo-download', {
      name: 'invoice/upo.requested',
      // Limit „3 naraz per NIP” w pg-boss działa tylko z grupą (AUD-92).
      groupId: nip,
      data: {
        invoiceId,
        tenantId,
        // `nip` powędruje do `downloadUpoJob` jako klucz concurrency
        // (`{ key: 'data.nip', limit: 3 }`) — limit per-tenant zapobiega
        // zalaniu KSeF /upo żądaniami z jednego podmiotu.
        nip,
        ksefNumber: result.ksefNumber,
        environment: env,
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

