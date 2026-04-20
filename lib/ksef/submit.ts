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
        }
      );

      // 6. Polling statusu
      const invoiceStatus = await pollInvoiceStatus(
        session.referenceNumber,
        sendResult.referenceNumber,
        accessToken,
        env
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
        });
      } catch {
        // Zamknięcie sesji to best-effort
      }
    }
  });
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
  intervalMs = 2000
): Promise<InvoiceStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await ksefFetch<InvoiceStatusResponse>(
      `/sessions/${sessionRef}/invoices/${invoiceRef}`,
      { accessToken, env }
    );

    const code = ksefNumericStatusCode(status.status?.code);
    if (code === INVOICE_STATUS.ACCEPTED) {
      return status;
    }
    if (Number.isFinite(code) && code >= INVOICE_STATUS.REJECTED) {
      const details = status.status.details?.join('; ') ?? '';
      throw new Error(
        `KSeF odrzucił fakturę: ${status.status.description}. Szczegóły: ${details}`
      );
    }

    // Status 150 (QUEUED) lub nieznany kod < 400 — czekamy
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `KSeF invoice polling timed out. Session: ${sessionRef}, invoice: ${invoiceRef}`
  );
}
