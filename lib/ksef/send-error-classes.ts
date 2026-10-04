/**
 * Katalog kodów błędu wysyłki do KSeF (`invoices.last_error_code`) — lustro
 * tabeli `ksef_error_codes` z migracji 00131. CZYSTY moduł: bez klienta KSeF,
 * walidatora XML i Node — można go importować w komponentach klienckich
 * (przyciski wg stanu faktury). Klasyfikacja wyjątków jest w
 * `send-error-codes.ts`, który re-eksportuje wszystko stąd.
 *
 * Klasa kodu decyduje o stanie faktury po wyczerpaniu prób i o wyjściach:
 *   - terminal   — błąd TREŚCI dokumentu (XSD, odrzucenie przez KSeF, strażnik
 *                  dokumentu): tylko powrót do szkicu i poprawa;
 *   - transient  — awaria, której zniknięcie nie wymaga zmiany dokumentu
 *                  (KSeF leży, limit, sesja, nasza baza): ponowienie,
 *                  część automatycznie (cron, PR 4);
 *   - hold       — hamulec operatora albo blokada rodzaju dokumentu:
 *                  ponowienie po zdjęciu hamulca;
 *   - reconcile  — nie wiadomo, czy KSeF ma fakturę: tylko operator;
 *   - setup      — brak/niezweryfikowany certyfikat: klient uzupełnia
 *                  ustawienia i wysyła ponownie.
 */

export const SEND_ERROR_CODES = {
  XSD_INVALID: 'XSD_INVALID',
  KSEF_REJECTED: 'KSEF_REJECTED',
  INVALID_DOCUMENT: 'INVALID_DOCUMENT',
  KSEF_UNAVAILABLE: 'KSEF_UNAVAILABLE',
  KSEF_RATE_LIMIT: 'KSEF_RATE_LIMIT',
  KSEF_SESSION: 'KSEF_SESSION',
  INFRA: 'INFRA',
  CREDENTIALS_UNAVAILABLE: 'CREDENTIALS_UNAVAILABLE',
  TRANSIENT_EXHAUSTED: 'TRANSIENT_EXHAUSTED',
  KSEF_PAUSED: 'KSEF_PAUSED',
  KOR_HOLD: 'KOR_HOLD',
  ROZ_HOLD_RECONCILE: 'ROZ_HOLD_RECONCILE',
  KSEF_DUPLICATE_RECONCILE: 'KSEF_DUPLICATE_RECONCILE',
  RESULT_UNCERTAIN: 'RESULT_UNCERTAIN',
  ENV_MISMATCH: 'ENV_MISMATCH',
  INVALID_EVENT: 'INVALID_EVENT',
  ENQUEUE_LOST: 'ENQUEUE_LOST',
  NO_CERTIFICATE: 'NO_CERTIFICATE',
  NOT_VERIFIED: 'NOT_VERIFIED',
} as const;

export type SendErrorCode = (typeof SEND_ERROR_CODES)[keyof typeof SEND_ERROR_CODES];
export type SendErrorClass = 'terminal' | 'transient' | 'hold' | 'reconcile' | 'setup';

export const SEND_ERROR_CLASS: Record<SendErrorCode, SendErrorClass> = {
  XSD_INVALID: 'terminal',
  KSEF_REJECTED: 'terminal',
  INVALID_DOCUMENT: 'terminal',
  KSEF_UNAVAILABLE: 'transient',
  KSEF_RATE_LIMIT: 'transient',
  KSEF_SESSION: 'transient',
  INFRA: 'transient',
  CREDENTIALS_UNAVAILABLE: 'transient',
  TRANSIENT_EXHAUSTED: 'transient',
  KSEF_PAUSED: 'hold',
  KOR_HOLD: 'hold',
  ROZ_HOLD_RECONCILE: 'hold',
  KSEF_DUPLICATE_RECONCILE: 'reconcile',
  RESULT_UNCERTAIN: 'reconcile',
  ENV_MISMATCH: 'reconcile',
  INVALID_EVENT: 'reconcile',
  ENQUEUE_LOST: 'reconcile',
  NO_CERTIFICATE: 'setup',
  NOT_VERIFIED: 'setup',
};

/** Kody, które cron cyklu życia ponawia sam (co 60 min przez 24 h — decyzja D1). */
export const AUTO_REQUEUE_CODES: readonly SendErrorCode[] = [
  SEND_ERROR_CODES.KSEF_UNAVAILABLE,
  SEND_ERROR_CODES.KSEF_RATE_LIMIT,
  SEND_ERROR_CODES.KSEF_SESSION,
  SEND_ERROR_CODES.INFRA,
];

export function isSendErrorCode(code: string | null | undefined): code is SendErrorCode {
  return typeof code === 'string' && code in SEND_ERROR_CLASS;
}

/** Klasa kodu z wiersza faktury; `null` dla braku kodu albo kodu spoza katalogu (historyczny). */
export function sendErrorClassOf(code: string | null | undefined): SendErrorClass | null {
  return isSendErrorCode(code) ? SEND_ERROR_CLASS[code] : null;
}

export function isAutoRequeueable(code: string | null | undefined): boolean {
  return AUTO_REQUEUE_CODES.includes(code as SendErrorCode);
}

/** Kody, przy których faktura kończy jako `rejected` (KSeF/XSD odrzucił treść). */
export function isContentRejection(code: SendErrorCode): boolean {
  return code === SEND_ERROR_CODES.XSD_INVALID || code === SEND_ERROR_CODES.KSEF_REJECTED;
}
