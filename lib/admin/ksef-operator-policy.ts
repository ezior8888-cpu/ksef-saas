/**
 * Co operator może zrobić z fakturą w `/admin/ksef` (cykl życia faktury,
 * PR 3c). CZYSTY moduł — importowany w komponencie klienckim przycisków
 * i w akcjach serwerowych; te same reguły, które sprawdza RPC z 00131.
 *
 * Różnice wobec akcji klienta (`lib/invoices/ksef-send-policy.ts`):
 *   - operator ma „Tylko uzgodnij” (`requeue_ksef_send(p_reconcile_only)`),
 *     także dla `rejected` — ale tylko gdy jest otwarty wpis `sent`, bo
 *     runner uzgadnia po referencji, a bez niej wysłałby fakturę od nowa;
 *   - operator może ponowić po hamulcu (klasa hold) — to on go zdejmuje;
 *   - klasa reconcile: operator decyduje (uzgodnij albo zostaw), a przy
 *     ENQUEUE_LOST, INVALID_EVENT i RESULT_UNCERTAIN może też wysłać
 *     ponownie (A4) — patrz `OPERATOR_REQUEUE_RECONCILE_CODES`.
 */

import { SEND_ERROR_CODES, sendErrorClassOf, type SendErrorCode } from '@/lib/ksef/send-error-classes';

/**
 * Kody klasy reconcile, przy których „Wyślij ponownie” operatora jest
 * bezpieczne (A4): runner zaczyna od rozstrzygnięcia zamiaru i uzgodnienia
 * otwartego wpisu (A2), treść faktury z dowodem kontaktu jest zamrożona
 * (00132), a KSeF odrzuca drugą fakturę o tym samym numerze (440, a sesja
 * z naszej historii = własny duplikat → `accepted`). Ponowienie tej samej
 * treści nie zrobi więc duplikatu.
 * Poza listą: KSEF_DUPLICATE_RECONCILE (ponowienie powtórzy 440; weryfikację
 * treści powtarza „Tylko uzgodnij” przy otwartym wpisie, a ręczny werdykt —
 * D-A4-1b). ENV_MISMATCH od D-A4-2 (00143) jest klasy terminal: ponowienie
 * wysłałoby fakturę w bieżącym środowisku, więc tylko szkic i decyzja klienta.
 */
export const OPERATOR_REQUEUE_RECONCILE_CODES: readonly SendErrorCode[] = [
  SEND_ERROR_CODES.ENQUEUE_LOST,
  SEND_ERROR_CODES.INVALID_EVENT,
  SEND_ERROR_CODES.RESULT_UNCERTAIN,
];

/**
 * Wpisy `ksef_submissions`, które „Tylko uzgodnij” ma czym uzgodnić: wysyłka
 * z numerem referencyjnym (`sent`) albo zamiar z numerem sesji (`intent`, A2
 * — runner zamyka sesję i pyta KSeF o jej faktury). Ta sama lista dla akcji
 * i karty faktury.
 */
export const OPEN_SUBMISSION_STATUSES = ['sent', 'intent'] as const;

export function hasOpenSubmission(history: ReadonlyArray<{ status: string | null }>): boolean {
  return history.some((s) => (OPEN_SUBMISSION_STATUSES as readonly (string | null)[]).includes(s.status));
}

export const OPERATOR_MESSAGES = {
  notFound: 'Nie ma takiej faktury.',
  incoming: 'To faktura przychodząca — nie wysyła się jej do KSeF.',
  special: 'Dokument specjalny (korekta, zaliczka, ROZ): zdarzenia wysyłki nie da się odtworzyć z wiersza. Dostępny jest tylko powrót do szkicu.',
  incomplete: 'Wiersz nie ma kompletnych danych faktury (fa3_data) — tylko powrót do szkicu.',
  noOpenSent: 'Brak otwartego wpisu wysyłki (sent ani zamiaru intent) — nie ma czego uzgadniać. Ponowna wysyłka wysłałaby fakturę od nowa.',
  paused: 'Wysyłki są wstrzymane wyłącznikiem operatora (killAllKsefSubmissions). Najpierw zdejmij hamulec.',
  pausedUnknown: 'Nie można sprawdzić wyłącznika wysyłek — zlecenie nie zostało wysłane.',
  noNip: 'Firma nie ma NIP-u w bazie ani w fakturze.',
  requeued: 'Zlecono ponowną wysyłkę. Status zmieni się po przebiegu workera.',
  reconcileQueued: 'Zlecono uzgodnienie po numerze referencyjnym. Worker nie wyśle faktury od nowa, dopóki KSeF nie odpowie o poprzedniej wysyłce.',
  reset: 'Faktura wróciła do szkicu.',
  onlyFailed: 'Ponowna wysyłka tylko ze stanu failed.',
  rejectedToDraft: 'Odrzuconej treści nie wysyła się ponownie — powrót do szkicu.',
  terminal: 'Błąd treści dokumentu — powrót do szkicu, nie ponowienie.',
  reconcileClass: 'Klasa reconcile: nie wysyłaj od nowa — użyj „Tylko uzgodnij” albo zostaw.',
  duplicateRequeue: 'KSeF ma już fakturę o tym numerze, a automat nie rozstrzygnął, czyja to treść — ponowienie powtórzy 440. Przy otwartym wpisie użyj „Tylko uzgodnij” (powtórzy weryfikację); inaczej runbook: KSEF_DUPLICATE_RECONCILE.',
  envMismatchRequeue: 'Faktura była zlecona w innym środowisku KSeF — ponowienie wysłałoby ją w bieżącym. Bez dowodu kontaktu: „Wróć do szkicu”, klient zdecyduje, czy wysłać ją tutaj. Otwarty wpis: „Tylko uzgodnij” uzgadnia w BIEŻĄCYM środowisku — wpisu sprzed przełączenia środowiska nie uzgadniaj tak (runbook: ENV_MISMATCH).',
  issueDatePassedRequeue: 'Dokument specjalny z datą wystawienia sprzed dzisiaj — worker nie wyśle go z wcześniejszą datą (decyzja 06.10.2026, 00147; do B2). Bez dowodu kontaktu: „Wróć do szkicu” (klient usuwa szkic i wystawia dokument od nowa z dzisiejszą datą). Z dowodem kontaktu (z otwartym wpisem albo bez) dokument specjalny nie ma dziś wyjścia w panelu — runbook ksef-error-codes, „Dokumenty specjalne” (A4b PR2, B2).',
  notFailedOrRejected: 'Dostępne tylko dla failed / rejected.',
  evidence: 'Faktura ma dowód kontaktu z KSeF (numer albo wpis sent/accepted/duplicate) — nie wraca do szkicu.',
} as const;

export interface OperatorButton {
  enabled: boolean;
  /** Dlaczego wyłączony — pokazywane jako podpowiedź. */
  reason: string | null;
}

export interface OperatorButtons {
  requeue: OperatorButton;
  reconcile: OperatorButton;
  reset: OperatorButton;
}

export interface OperatorButtonsInput {
  direction: string | null;
  status: string | null;
  errorCode: string | null;
  invoiceKind: string | null;
  openSent: boolean;
  evidence: boolean;
}

function reconcileRequeueRefusal(code: string | null): string {
  if (code === SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE) return OPERATOR_MESSAGES.duplicateRequeue;
  return OPERATOR_MESSAGES.reconcileClass;
}

function terminalRequeueRefusal(code: string | null): string {
  if (code === SEND_ERROR_CODES.ENV_MISMATCH) return OPERATOR_MESSAGES.envMismatchRequeue;
  if (code === SEND_ERROR_CODES.ISSUE_DATE_PASSED) return OPERATOR_MESSAGES.issueDatePassedRequeue;
  return OPERATOR_MESSAGES.terminal;
}

/**
 * „Wyślij ponownie” operatora — ta sama decyzja dla przycisku i akcji
 * (`operatorRequeueAction`); nie zależy od dowodu kontaktu ani otwartego wpisu.
 */
export function operatorRequeueButton(
  input: Pick<OperatorButtonsInput, 'direction' | 'status' | 'errorCode' | 'invoiceKind'>,
): OperatorButton {
  const outgoing = input.direction === 'outgoing';
  const special = (input.invoiceKind ?? 'regular') !== 'regular';
  const errorClass = sendErrorClassOf(input.errorCode);
  return !outgoing
    ? { enabled: false, reason: OPERATOR_MESSAGES.incoming }
    : input.status === 'rejected'
      ? { enabled: false, reason: OPERATOR_MESSAGES.rejectedToDraft }
      : input.status !== 'failed'
        ? { enabled: false, reason: OPERATOR_MESSAGES.onlyFailed }
        : special
          // ISSUE_DATE_PASSED (00147) dostają tylko dokumenty specjalne — dokładny powód zamiast ogólnego.
          ? { enabled: false, reason: input.errorCode === SEND_ERROR_CODES.ISSUE_DATE_PASSED ? OPERATOR_MESSAGES.issueDatePassedRequeue : OPERATOR_MESSAGES.special }
          : errorClass === 'terminal'
            ? { enabled: false, reason: terminalRequeueRefusal(input.errorCode) }
            : errorClass === 'reconcile' && !OPERATOR_REQUEUE_RECONCILE_CODES.includes(input.errorCode as SendErrorCode)
              ? { enabled: false, reason: reconcileRequeueRefusal(input.errorCode) }
              : { enabled: true, reason: null };
}

export function operatorInvoiceButtons(input: OperatorButtonsInput): OperatorButtons {
  const outgoing = input.direction === 'outgoing';
  const failedOrRejected = input.status === 'failed' || input.status === 'rejected';
  const special = (input.invoiceKind ?? 'regular') !== 'regular';
  const errorClass = sendErrorClassOf(input.errorCode);

  const requeue = operatorRequeueButton(input);

  const reconcile: OperatorButton = !outgoing
    ? { enabled: false, reason: OPERATOR_MESSAGES.incoming }
    : !failedOrRejected
      ? { enabled: false, reason: OPERATOR_MESSAGES.notFailedOrRejected }
      : special
        ? { enabled: false, reason: OPERATOR_MESSAGES.special }
        : !input.openSent
          ? { enabled: false, reason: OPERATOR_MESSAGES.noOpenSent }
          : { enabled: true, reason: null };

  const reset: OperatorButton = !outgoing
    ? { enabled: false, reason: OPERATOR_MESSAGES.incoming }
    : !failedOrRejected
      ? { enabled: false, reason: OPERATOR_MESSAGES.notFailedOrRejected }
      : input.evidence
        ? { enabled: false, reason: OPERATOR_MESSAGES.evidence }
        : errorClass === 'reconcile'
          ? { enabled: false, reason: OPERATOR_MESSAGES.reconcileClass }
          : { enabled: true, reason: null };

  return { requeue, reconcile, reset };
}
