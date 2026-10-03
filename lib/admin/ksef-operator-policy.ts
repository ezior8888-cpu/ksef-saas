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
 *   - klasa reconcile: operator decyduje (uzgodnij albo zostaw), ale nie
 *     wysyła od nowa.
 */

import { sendErrorClassOf } from '@/lib/ksef/send-error-classes';

export const OPERATOR_MESSAGES = {
  notFound: 'Nie ma takiej faktury.',
  incoming: 'To faktura przychodząca — nie wysyła się jej do KSeF.',
  special: 'Dokument specjalny (korekta, zaliczka, ROZ): zdarzenia wysyłki nie da się odtworzyć z wiersza. Dostępny jest tylko powrót do szkicu.',
  incomplete: 'Wiersz nie ma kompletnych danych faktury (fa3_data) — tylko powrót do szkicu.',
  noOpenSent: 'Brak otwartego wpisu wysyłki (sent) — nie ma czego uzgadniać. Ponowna wysyłka wysłałaby fakturę od nowa.',
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

export function operatorInvoiceButtons(input: OperatorButtonsInput): OperatorButtons {
  const outgoing = input.direction === 'outgoing';
  const failedOrRejected = input.status === 'failed' || input.status === 'rejected';
  const special = (input.invoiceKind ?? 'regular') !== 'regular';
  const errorClass = sendErrorClassOf(input.errorCode);

  const requeue: OperatorButton = !outgoing
    ? { enabled: false, reason: OPERATOR_MESSAGES.incoming }
    : input.status === 'rejected'
      ? { enabled: false, reason: OPERATOR_MESSAGES.rejectedToDraft }
      : input.status !== 'failed'
        ? { enabled: false, reason: OPERATOR_MESSAGES.onlyFailed }
        : special
          ? { enabled: false, reason: OPERATOR_MESSAGES.special }
          : errorClass === 'terminal'
            ? { enabled: false, reason: OPERATOR_MESSAGES.terminal }
            : errorClass === 'reconcile'
              ? { enabled: false, reason: OPERATOR_MESSAGES.reconcileClass }
              : { enabled: true, reason: null };

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
