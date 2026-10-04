import { KsefApiError, ksefErrorCodes, ksefFetch } from './client';
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
  SessionInvoicesResponse,
} from '@/types/ksef';
import { INVOICE_STATUS } from '@/types/ksef';

// Odczyt kodów błędu KSeF mieszka w `client.ts` (getter `KsefApiError.ksefCode`
// czyta to samo). Eksport stąd zostaje, bo job wysyłki i atrapy testów biorą
// go z `@/lib/ksef/submit`.
export { ksefErrorCodes };

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
export interface SubmitInvoiceHooks {
  /**
   * Po otwarciu sesji, PRZED wysłaniem pliku (A2): zapis zamiaru wysyłki
   * z numerem sesji. Błąd hooka PRZERYWA wysyłkę — bez śladu sesji ponowienie
   * nie umiałoby sprawdzić, czy KSeF dostał plik, i wysłałoby go drugi raz.
   */
  onSessionOpened?: (session: { sessionReferenceNumber: string }) => Promise<void>;
  /**
   * Zaraz po przyjęciu pliku przez KSeF, przed odpytywaniem statusu — moment,
   * od którego ponowna wysyłka byłaby duplikatem. Błąd hooka nie przerywa
   * wysyłki (faktura już jest w KSeF), tylko zostaje zalogowany.
   */
  onInvoiceSent?: (references: {
    sessionReferenceNumber: string;
    invoiceReferenceNumber: string;
  }) => Promise<void>;
  /**
   * KSeF odpowiedział na wysyłkę pliku błędem 4xx (poza 408 — naszym
   * timeoutem): pliku w tej sesji nie ma. Pozwala zamknąć zamiar bez pytania
   * KSeF ponownie. Błąd hooka nie zmienia wyniku wysyłki, tylko zostaje
   * zalogowany (zamiar rozstrzygnie wtedy następna próba).
   */
  onInvoiceNotAccepted?: (
    session: { sessionReferenceNumber: string },
    error: KsefApiError,
  ) => Promise<void>;
}

/**
 * Czy odpowiedź KSeF na wysyłkę pliku oznacza, że plik NIE został przyjęty.
 * 4xx to odmowa po stronie KSeF; 408 to nasz timeout (odpowiedź nie dotarła),
 * a 5xx i błędy sieci — niepewność: KSeF mógł plik przyjąć.
 */
export function isInvoiceNotAcceptedError(e: unknown): e is KsefApiError {
  return e instanceof KsefApiError && e.status >= 400 && e.status < 500 && e.status !== 408;
}

export async function submitInvoice(
  invoiceXml: string,
  auth: KsefAuth,
  env?: KsefEnvironment,
  auditContext?: SubmitAuditContext,
  hooks?: SubmitInvoiceHooks,
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
      // 3a. Zamiar wysyłki z numerem sesji — przed plikiem (A2). Błąd = bez wysyłki.
      if (hooks?.onSessionOpened) {
        await hooks.onSessionOpened({ sessionReferenceNumber: session.referenceNumber });
      }

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
      ).catch(async (e: unknown) => {
        if (hooks?.onInvoiceNotAccepted && isInvoiceNotAcceptedError(e)) {
          try {
            await hooks.onInvoiceNotAccepted({ sessionReferenceNumber: session.referenceNumber }, e);
          } catch (hookError) {
            console.error(
              '[ksef.submit] zamknięcie zamiaru wysyłki nieudane',
              hookError instanceof Error ? hookError.message : String(hookError),
            );
          }
        }
        throw sessionTemporarilyUnavailableAsRetryable(e);
      });

      if (hooks?.onInvoiceSent) {
        try {
          await hooks.onInvoiceSent({
            sessionReferenceNumber: session.referenceNumber,
            invoiceReferenceNumber: sendResult.referenceNumber,
          });
        } catch (e) {
          console.error(
            '[ksef.submit] zapis numerów referencyjnych nieudany',
            e instanceof Error ? e.message : String(e),
          );
        }
      }

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
 * Rozstrzyga pojedynczy status faktury — wspólne dla pollingu i uzgadniania
 * po numerze referencyjnym, żeby obie drogi decydowały identycznie.
 * Akceptacja → status; w toku → null; odrzucenie albo awaria KSeF → wyjątek.
 */
function settleInvoiceStatus(status: InvoiceStatusResponse): InvoiceStatusResponse | null {
  const code = ksefNumericStatusCode(status.status?.code);
  if (code === INVOICE_STATUS.ACCEPTED) {
    return status;
  }
  if (Number.isFinite(code) && code >= KSEF_SYSTEM_STATUS_MIN) {
    // 5xx w statusie to przerwanie po stronie KSeF, nie ocena treści. 550:
    // „Przetwarzanie zostało przerwane z przyczyn wewnętrznych systemu.
    // Spróbuj ponownie.” (CIRFMF/ksef-docs, RC5.7). Zwykły Error = ponowienie;
    // ponowienie najpierw uzgadnia status po numerze referencyjnym.
    throw new Error(
      `KSeF przerwał przetwarzanie faktury (status ${code}): ${status.status.description}`,
    );
  }
  if (Number.isFinite(code) && code >= INVOICE_STATUS.REJECTED) {
    throw new KsefInvoiceRejectedError(code, status.status);
  }
  return null;
}

export type InvoiceReferenceStatus =
  | { state: 'accepted'; ksefNumber: string; acquisitionTimestamp?: string }
  | { state: 'processing' };

/**
 * Jednorazowe sprawdzenie statusu faktury wysłanej wcześniej, po numerach
 * referencyjnych z `ksef_submissions` — zamiast wysyłać ją drugi raz.
 * Odrzucenie (400–499) rzuca `KsefInvoiceRejectedError`, awaria KSeF — Error.
 */
export async function checkInvoiceStatusByReference(
  references: { sessionReferenceNumber: string; invoiceReferenceNumber: string },
  auth: KsefAuth,
  env?: KsefEnvironment,
  auditContext?: SubmitAuditContext,
): Promise<InvoiceReferenceStatus> {
  return ksefRateLimiter.enqueue(auth.nip, async () => {
    const authSession = await ksefSessionCache.getSession(auth, env);
    const status = await ksefFetch<InvoiceStatusResponse>(
      `/sessions/${encodeURIComponent(references.sessionReferenceNumber)}/invoices/${encodeURIComponent(references.invoiceReferenceNumber)}`,
      {
        accessToken: authSession.accessToken,
        env,
        audit: auditContext
          ? {
              ...auditContext,
              action: 'invoice.reconcile',
              metadata: { sessionRef: references.sessionReferenceNumber },
            }
          : undefined,
      },
    );
    const settled = settleInvoiceStatus(status);
    if (!settled) return { state: 'processing' };
    if (!settled.ksefNumber) {
      throw new Error('KSeF: faktura przyjęta bez numeru KSeF w statusie');
    }
    return {
      state: 'accepted',
      ksefNumber: settled.ksefNumber,
      acquisitionTimestamp: settled.acquisitionTimestamp,
    };
  });
}

/** Kod KSeF „Brak sesji o wskazanym numerze referencyjnym” (open-api.json, HTTP 400). */
export const KSEF_SESSION_NOT_FOUND = 21173;

export interface SessionInvoiceSummary {
  referenceNumber: string;
  invoiceNumber: string | null;
  /** SHA-256 niezaszyfrowanego XML, Base64. */
  invoiceHash: string;
  statusCode: number;
}

/**
 * Faktury, które KSeF ma w danej sesji online — do rozstrzygnięcia zamiaru
 * wysyłki bez numeru referencyjnego faktury (A2). Najpierw zamyka sesję:
 * po zamknięciu nic już do niej nie dotrze, więc pusta lista znaczy, że plik
 * z tamtej próby NIE trafił do KSeF. Zamknięcie odrzucone przez KSeF (4xx:
 * sesja już zamknięta albo wygasła) nie przeszkadza; chwilowa awaria (5xx,
 * 429, timeout, sieć) przerywa — bez pewnego zamknięcia nie ma pewnej listy.
 *
 * Każda nasza sesja niesie jedną fakturę, więc pierwsza strona wystarcza.
 */
export async function listSessionInvoicesAfterClose(
  sessionReferenceNumber: string,
  auth: KsefAuth,
  env?: KsefEnvironment,
  auditContext?: SubmitAuditContext,
): Promise<SessionInvoiceSummary[]> {
  return ksefRateLimiter.enqueue(auth.nip, async () => {
    const authSession = await ksefSessionCache.getSession(auth, env);
    const audit = (action: string) =>
      auditContext
        ? { ...auditContext, action, metadata: { sessionRef: sessionReferenceNumber } }
        : undefined;
    try {
      await ksefFetch(`/sessions/online/${encodeURIComponent(sessionReferenceNumber)}/close`, {
        method: 'POST',
        accessToken: authSession.accessToken,
        env,
        audit: audit('session.close'),
      });
    } catch (e) {
      if (!(e instanceof KsefApiError) || e.isRetryable || e.isAuthError) throw e;
    }
    const list = await ksefFetch<SessionInvoicesResponse>(
      `/sessions/${encodeURIComponent(sessionReferenceNumber)}/invoices?pageSize=100`,
      { accessToken: authSession.accessToken, env, audit: audit('session.invoices') },
    );
    return (list.invoices ?? []).map((inv) => ({
      referenceNumber: inv.referenceNumber,
      invoiceNumber: inv.invoiceNumber ?? null,
      invoiceHash: inv.invoiceHash,
      statusCode: ksefNumericStatusCode(inv.status?.code),
    }));
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

    const settled = settleInvoiceStatus(status);
    if (settled) return settled;

    // Status 150 (QUEUED) lub nieznany kod < 400 — czekamy
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `KSeF invoice polling timed out. Session: ${sessionRef}, invoice: ${invoiceRef}`
  );
}

/** Kod KSeF „Sesja tymczasowo niedostępna” (API 2.8.0, produkcja od 23.09.2026). */
export const KSEF_SESSION_TEMPORARILY_UNAVAILABLE = 21184;

/**
 * 21184 przychodzi z HTTP 400, więc wyglądał jak ostateczne odrzucenie
 * faktury. MF zaleca otworzyć nową sesję i kontynuować wysyłkę — robimy to
 * kolejną próbą joba (każda próba otwiera własną sesję online), dlatego błąd
 * dostaje status ponawialny (F-050).
 */
function sessionTemporarilyUnavailableAsRetryable(e: unknown): unknown {
  if (
    e instanceof KsefApiError &&
    e.status === 400 &&
    ksefErrorCodes(e.body).includes(KSEF_SESSION_TEMPORARILY_UNAVAILABLE)
  ) {
    return new KsefApiError(
      503,
      e.body,
      `KSeF: sesja tymczasowo niedostępna (${KSEF_SESSION_TEMPORARILY_UNAVAILABLE}) — ponowimy wysyłkę w nowej sesji`,
    );
  }
  return e;
}
