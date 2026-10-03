/**
 * Co klient może zrobić z fakturą po nieudanej wysyłce (cykl życia faktury,
 * PR 3b — K3 z rewizji 03.10.2026, decyzje D2 i D4). Jedna tabela decyzji
 * dla akcji serwerowych (`actions-detail.ts`) i przycisków (`failed-invoice-
 * actions.tsx`), żeby interfejs nie pokazywał przycisku, którego akcja odmówi.
 *
 * CZYSTY moduł (importowany w komponencie klienckim): tylko katalog klas
 * z `send-error-classes.ts`. RPC z 00131 sprawdzają to samo po stronie bazy —
 * ta tabela jest pierwszą linią, nie jedyną.
 */

import { sendErrorClassOf, type SendErrorClass } from '@/lib/ksef/send-error-classes';

/** Role, które uruchamiają ponowną wysyłkę i powrót do szkicu (D4). */
export const KSEF_SEND_MANAGER_ROLES: readonly string[] = ['owner', 'admin'];

export function canManageKsefSend(role: string | null | undefined): boolean {
  return typeof role === 'string' && KSEF_SEND_MANAGER_ROLES.includes(role);
}

export const KSEF_SEND_MESSAGES = {
  role: 'Ponowną wysyłkę i powrót do szkicu może uruchomić właściciel lub administrator firmy.',
  direction: 'Ponownie wysłać można tylko fakturę wystawioną w FaktFlow.',
  status: 'Ponowną wysyłkę można uruchomić tylko dla faktury z błędem wysyłki.',
  rejected: 'KSeF odrzucił treść tej faktury — wróć do szkicu, popraw i wyślij ponownie.',
  terminal: 'Dokument nie przeszedł kontroli treści — wróć do szkicu i popraw.',
  reconcile: 'Ta faktura wymaga uzgodnienia z KSeF — zajmuje się tym operator FaktFlow. Nie wysyłaj jej ponownie.',
  hold: 'Wysyłka jest wstrzymana przez operatora. Faktura wyjdzie automatycznie po przywróceniu wysyłki.',
  special: 'Korektę, zaliczkę i fakturę końcową wysyła się ponownie przez powrót do szkicu, usunięcie i wystawienie od nowa.',
  incomplete: 'Faktura nie ma kompletnych danych do wysyłki. Wróć do szkicu i wystaw ją ponownie.',
  transient: 'Błąd po stronie KSeF albo FaktFlow — wysyłkę ponowimy automatycznie. Możesz też wysłać teraz.',
  setup: 'Brak zweryfikowanego certyfikatu KSeF — uzupełnij ustawienia KSeF, potem wyślij ponownie.',
  historical: 'Wysyłka nie powiodła się. Możesz wysłać ponownie albo wrócić do szkicu.',
  askManager: 'Poproś właściciela lub administratora firmy.',
  resetDone: 'Faktura wróciła do szkicu. Popraw ją i wyślij ponownie.',
  resetFailed: 'Nie udało się przywrócić szkicu. Spróbuj ponownie.',
  notFound: 'Nie można znaleźć faktury w tej organizacji.',
} as const;

export type ResendRefusal =
  | 'direction'
  | 'status'
  | 'rejected'
  | 'terminal'
  | 'reconcile'
  | 'hold'
  | 'special';

export type ResendDecision =
  | { allowed: true; errorClass: SendErrorClass | null }
  | { allowed: false; reason: ResendRefusal; message: string };

export interface ResendInput {
  direction: string | null;
  status: string | null;
  errorCode: string | null;
  invoiceKind: string | null;
}

/**
 * Czy klient może uruchomić `requeue_ksef_send`. `rejected` nigdy (D2: wraca
 * do szkicu); `failed` wg klasy kodu: transient i setup tak, brak kodu
 * (historyczny) tak — decyduje człowiek, a runner i tak zaczyna od
 * uzgodnienia; terminal, hold i reconcile nie. Dokumenty specjalne nie, bo
 * zdarzenie wysyłki nie da się odtworzyć z samego wiersza (jak szkic).
 */
export function decideResend(input: ResendInput): ResendDecision {
  if (input.direction !== 'outgoing') {
    return { allowed: false, reason: 'direction', message: KSEF_SEND_MESSAGES.direction };
  }
  if (input.status === 'rejected') {
    return { allowed: false, reason: 'rejected', message: KSEF_SEND_MESSAGES.rejected };
  }
  if (input.status !== 'failed') {
    return { allowed: false, reason: 'status', message: KSEF_SEND_MESSAGES.status };
  }
  const errorClass = sendErrorClassOf(input.errorCode);
  if (errorClass === 'terminal') {
    return { allowed: false, reason: 'terminal', message: KSEF_SEND_MESSAGES.terminal };
  }
  if (errorClass === 'reconcile') {
    return { allowed: false, reason: 'reconcile', message: KSEF_SEND_MESSAGES.reconcile };
  }
  if (errorClass === 'hold') {
    return { allowed: false, reason: 'hold', message: KSEF_SEND_MESSAGES.hold };
  }
  if ((input.invoiceKind ?? 'regular') !== 'regular') {
    return { allowed: false, reason: 'special', message: KSEF_SEND_MESSAGES.special };
  }
  return { allowed: true, errorClass };
}

export interface FailedInvoiceButtons {
  /** „Wyślij ponownie” — `requeue_ksef_send`. */
  resend: boolean;
  /** „Wróć do szkicu” — `reset_ksef_send`. */
  reset: boolean;
  /** Link do ustawień KSeF (brak certyfikatu). */
  settings: boolean;
  /** Zdanie nad przyciskami: co się stało i co dalej. */
  info: string;
}

export interface FailedInvoiceButtonsInput {
  status: string;
  errorCode: string | null;
  invoiceKind: string | null;
  /** Rola zalogowanej osoby w firmie dopuszcza akcje (D4). */
  canManage: boolean;
}

/** Tabela z sekcji 7 projektu cyklu życia; `null` = stan bez przycisków błędu. */
export function failedInvoiceButtons(input: FailedInvoiceButtonsInput): FailedInvoiceButtons | null {
  if (input.status !== 'failed' && input.status !== 'rejected') return null;
  const special = (input.invoiceKind ?? 'regular') !== 'regular';
  const decision = decideResend({
    direction: 'outgoing',
    status: input.status,
    errorCode: input.errorCode,
    invoiceKind: input.invoiceKind,
  });
  const errorClass = sendErrorClassOf(input.errorCode);

  let resend = decision.allowed;
  let reset: boolean;
  let settings = false;
  let info: string;

  if (input.status === 'rejected') {
    reset = true;
    info = KSEF_SEND_MESSAGES.rejected;
  } else if (!decision.allowed) {
    // terminal → szkic; hold/reconcile → nic (automat / operator); special → szkic.
    reset = decision.reason === 'terminal' || decision.reason === 'special';
    info = decision.message;
  } else {
    reset = true;
    settings = errorClass === 'setup';
    info = errorClass === 'transient'
      ? KSEF_SEND_MESSAGES.transient
      : errorClass === 'setup'
        ? KSEF_SEND_MESSAGES.setup
        : KSEF_SEND_MESSAGES.historical;
  }
  if (special && reset && input.status !== 'rejected' && decision.allowed === false && decision.reason !== 'special') {
    info = `${info} ${KSEF_SEND_MESSAGES.special}`;
  }

  if (!input.canManage && (resend || reset)) {
    resend = false;
    reset = false;
    info = `${info} ${KSEF_SEND_MESSAGES.askManager}`;
  }
  return { resend, reset, settings, info };
}

/** Komunikat dla klienta po błędzie `reset_ksef_send` (P0001 pisze RPC wprost dla klienta). */
export function describeResetError(error: { code?: string | null; message?: string | null }): string {
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code === 'P0002') return KSEF_SEND_MESSAGES.notFound;
  return KSEF_SEND_MESSAGES.resetFailed;
}
