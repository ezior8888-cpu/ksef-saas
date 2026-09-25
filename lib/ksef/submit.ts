import { ksefFetch } from './client';
import { ksefNumericStatusCode } from './normalize-status-code';
import { generateSessionEncryption, encryptInvoiceXml } from './encryption';
import { ksefSessionCache } from './session-cache';
import { ksefRateLimiter } from './rate-limiter';
import type { KsefAuth } from './auth';
import type {
  OpenOnlineSessionRequest,
  OpenOnlineSessionResponse,
  SendInvoiceRequest,
  SendInvoiceResponse,
  InvoiceStatusResponse,
  KsefEnvironment,
} from '@/types/ksef';
import { INVOICE_STATUS } from '@/types/ksef';

export interface SubmitInvoiceResult {
  /** Numer KSeF nadany fakturze po akceptacji */
  ksefNumber: string;
  /** Numer referencyjny sesji KSeF */
  sessionReferenceNumber: string;
  /** Numer referencyjny faktury w sesji */
  invoiceReferenceNumber: string;
  /**
   * Timestamp akceptacji faktury przez KSeF (ISO 8601).
   *
   * `undefined` w rzadkim scenariuszu: status przeszedł polling jako zakończony,
   * ale odpowiedź nie zawiera `acquisitionTimestamp` (spotykane głównie w test/demo
   * KSeF przy race-condition na stronie serwera). Konsumenci muszą pominąć to pole
   * przy zapisie - Postgres `TIMESTAMPTZ` odrzuca pusty string.
   */
  acquisitionTimestamp?: string;
  /** URL do pobrania UPO (ważny ograniczony czas) */
  upoDownloadUrl?: string;
}

/** Kontekst audytu (Faza 23 sekcja 3) — opcjonalny, propaguje się do każdego
 * `ksefFetch` wewnątrz tego flow. Bez niego wywołania nie są logowane do
 * `audit_logs` (backwards-compat — testy / dev scripty).
 */
export interface SubmitAuditContext {
  tenantId: string;
  invoiceId: string;
}

/**
 * Pełny flow wysyłki JEDNEJ faktury do KSeF:
 * 1. Pobierz/utwórz sesję auth
 * 2. Wygeneruj klucze szyfrowania
 * 3. Otwórz sesję online
 * 4. Zaszyfruj XML faktury
 * 5. Wyślij fakturę
 * 6. Polling statusu aż ACCEPTED/REJECTED
 * 7. Zamknij sesję
 * 8. Zwróć numer KSeF
 */
export async function submitInvoice(
  invoiceXml: string,
  auth: KsefAuth,
  env?: KsefEnvironment,
  auditContext?: SubmitAuditContext,
): Promise<SubmitInvoiceResult> {
  return ksefRateLimiter.enqueue(auth.nip, async () => {
    // 1. Sesja auth (cache dispatcha na XAdES albo token wg auth.type).
    const authSession = await ksefSessionCache.getSession(auth, env);
    const accessToken = authSession.accessToken;

    // 2. Klucze szyfrowania sesji
    const encryption = await generateSessionEncryption();

    // 3. Otwórz sesję online
    const openSessionReq: OpenOnlineSessionRequest = {
      formCode: {
        systemCode: 'FA (3)',
        schemaVersion: '1-0E',
        value: 'FA',
      },
      encryption: {
        encryptedSymmetricKey: encryption.encryptedSymmetricKey,
        initializationVector: encryption.initializationVector,
      },
    };

    const session = await ksefFetch<OpenOnlineSessionResponse>('/sessions/online', {
      method: 'POST',
      accessToken,
      body: openSessionReq,
      env,
      audit: auditContext
        ? { ...auditContext, action: 'session.open' }
        : undefined,
    });

    try {
      // 4. Szyfrowanie XML (zwraca komplet: hash+size niezaszyfrowanego
      //    i zaszyfrowanego body zgodnie z wymogami KSeF 2.0).
      const payload = encryptInvoiceXml(invoiceXml, encryption);

      // 5. Wyślij fakturę
      const sendReq: SendInvoiceRequest = {
        invoiceHash: payload.invoiceHash,
        invoiceSize: payload.invoiceSize,
        encryptedInvoiceHash: payload.encryptedInvoiceHash,
        encryptedInvoiceSize: payload.encryptedInvoiceSize,
        encryptedInvoiceContent: payload.encryptedInvoiceContent,
      };

      const sendResult = await ksefFetch<SendInvoiceResponse>(
        `/sessions/online/${session.referenceNumber}/invoices`,
        {
          method: 'POST',
          accessToken,
          body: sendReq,
          env,
          audit: auditContext
            ? {
                ...auditContext,
                action: 'invoice.send',
                metadata: { sessionRef: session.referenceNumber },
              }
            : undefined,
        }
      );

      // 6. Polling statusu
      const invoiceStatus = await pollInvoiceStatus(
        session.referenceNumber,
        sendResult.referenceNumber,
        accessToken,
        env,
        undefined,
        undefined,
        auditContext,
      );

      if (!invoiceStatus.ksefNumber) {
        throw new Error(
          `KSeF: faktura przetworzona bez numeru KSeF. Status: ${invoiceStatus.status.description}`
        );
      }

      return {
        ksefNumber: invoiceStatus.ksefNumber,
        sessionReferenceNumber: session.referenceNumber,
        invoiceReferenceNumber: sendResult.referenceNumber,
        acquisitionTimestamp: invoiceStatus.acquisitionTimestamp,
        upoDownloadUrl: invoiceStatus.upoDownloadUrl,
      };
    } finally {
      // 7. Zamknij sesję (nawet jeśli był błąd)
      try {
        await ksefFetch(`/sessions/online/${session.referenceNumber}/close`, {
          method: 'POST',
          accessToken,
          env,
          audit: auditContext
            ? { ...auditContext, action: 'session.close' }
            : undefined,
        });
      } catch {
        // Zamknięcie sesji to best-effort
      }
    }
  });
}

/** Kod statusu faktury „Duplikat faktury” (seller NIP + RodzajFaktury + P_2). */
export const KSEF_DUPLICATE_INVOICE = 440;

/** Od 500 w górę status faktury to błąd systemu KSeF (np. 550), nie odrzucenie. */
export const KSEF_SYSTEM_STATUS_MIN = 500;

/**
 * KSeF przyjął plik, ale odrzucił fakturę w statusie (kod 400–499).
 *
 * To decyzja o TREŚCI, nie awaria łącza — ponowienie wysłałoby tę samą
 * fakturę jeszcze raz, a po wyczerpaniu prób job zaparkowałby ją w Offline24
 * jak przy awarii (z kodami QR offline dla dokumentu, którego KSeF nie chce).
 *
 * Szczególny przypadek to 440: faktura o tym numerze JUŻ jest w KSeF.
 * Najczęściej to nasza wcześniejsza wysyłka, której wyniku nie doczekaliśmy
 * (polling skończył się po 60 s, a KSeF przyjął fakturę później). Wtedy
 * komunikat podaje numer KSeF oryginału — bez tego faktura wisiałaby jako
 * błąd, choć w KSeF jest przyjęta.
 */
export class KsefInvoiceRejectedError extends Error {
  readonly code: number;
  readonly originalKsefNumber: string | null;
  readonly originalSessionReferenceNumber: string | null;

  constructor(code: number, status: InvoiceStatusResponse['status']) {
    const details = status.details?.join('; ') ?? '';
    const original = status.extensions?.originalKsefNumber ?? null;
    const originalSession = status.extensions?.originalSessionReferenceNumber ?? null;
    super(
      code === KSEF_DUPLICATE_INVOICE
        ? `KSeF ma już fakturę o tym numerze${original ? ` — numer KSeF ${original}` : ''}` +
            `${originalSession ? ` (sesja ${originalSession})` : ''}. Najpewniej to ta sama ` +
            'faktura z wcześniejszej próby: sprawdź ją w KSeF, zanim wystawisz ją ponownie. ' +
            `Szczegóły: ${details}`
        : `KSeF odrzucił fakturę: ${status.description}. Szczegóły: ${details}`,
    );
    this.name = 'KsefInvoiceRejectedError';
    this.code = code;
    this.originalKsefNumber = original;
    this.originalSessionReferenceNumber = originalSession;
  }

  get isDuplicate(): boolean {
    return this.code === KSEF_DUPLICATE_INVOICE;
  }
}

/**
 * Polling statusu faktury co 2 sekundy aż do akceptacji / odrzucenia.
 */
async function pollInvoiceStatus(
  sessionRef: string,
  invoiceRef: string,
  accessToken: string,
  env?: KsefEnvironment,
  maxAttempts = 30,
  intervalMs = 2000,
  auditContext?: SubmitAuditContext,
): Promise<InvoiceStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await ksefFetch<InvoiceStatusResponse>(
      `/sessions/${sessionRef}/invoices/${invoiceRef}`,
      {
        accessToken,
        env,
        audit: auditContext
          ? {
              ...auditContext,
              action: 'invoice.poll',
              metadata: { sessionRef, attempt },
            }
          : undefined,
      }
    );

    const code = ksefNumericStatusCode(status.status?.code);
    if (code === INVOICE_STATUS.ACCEPTED) {
      return status;
    }
    if (Number.isFinite(code) && code >= KSEF_SYSTEM_STATUS_MIN) {
      // 5xx w statusie to przerwanie po stronie KSeF, nie ocena treści. 550:
      // „Przetwarzanie zostało przerwane z przyczyn wewnętrznych systemu.
      // Spróbuj ponownie.” (CIRFMF/ksef-docs, RC5.7). Zwykły Error = ponowienie;
      // jeśli faktura jednak weszła, następna wysyłka dostanie 440 z jej numerem.
      throw new Error(
        `KSeF przerwał przetwarzanie faktury (status ${code}): ${status.status.description}`,
      );
    }
    if (Number.isFinite(code) && code >= INVOICE_STATUS.REJECTED) {
      throw new KsefInvoiceRejectedError(code, status.status);
    }

    // Status 150 (QUEUED) lub nieznany kod < 400 — czekamy
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `KSeF invoice polling timed out. Session: ${sessionRef}, invoice: ${invoiceRef}`
  );
}
