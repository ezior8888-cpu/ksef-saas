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
 *
 * Dokumenty specjalne (KOR, ZAL, ROZ) od A4b PR2a: zdarzenie odtwarzamy
 * z kopii na wierszu (`ksefResendFacts`). Po klasie kodu: środowisko znane →
 * dane zapisane → rodzaj niewstrzymany (KOR na PROD, ROZ wszędzie — C4) →
 * pełna wysyłka tylko w dniu wystawienia (decyzja Bartosza 06.10.2026 b).
 * „Tylko uzgodnij” datę pomija — nie wysyła.
 */

import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
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
  envUnknown: 'Środowisko KSeF nie jest poprawnie skonfigurowane (KSEF_ENV) — zlecenie nie zostało wysłane.',
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
  issueDatePassedRequeue: 'Dokument specjalny z datą wystawienia sprzed dzisiaj — worker nie wysyła go z wcześniejszą datą (decyzja 06.10.2026, 00147; do B2). Ten kod powstaje bez otwartego wpisu (worker odmawia po uzgodnieniu, przed plikiem i zamiarem), więc nie ma czego uzgadniać. Bez dowodu kontaktu: „Wróć do szkicu” (klient usuwa szkic i wystawia dokument od nowa z dzisiejszą datą). Z dowodem kontaktu brak wyjścia w panelu do B2 — sprawdź dokument w KSeF i zgłoś go Bartoszowi (runbook ksef-error-codes, „Dokumenty specjalne”).',
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
  /** Tylko do etykiet komunikatów — o ponowieniu decydują `facts`. */
  invoiceKind: string | null;
  openSent: boolean;
  evidence: boolean;
  /** Ponowienie z kopii (A4b PR2a): dane zapisane, rodzaj wstrzymany, data wystawienia minęła. */
  facts: KsefResendFacts;
  /** `KSEF_ENV` aplikacji poprawny — bez niego nic nie zlecamy. */
  environmentKnown: boolean;
}

/** Etykiety dokumentów specjalnych w komunikatach operatora. */
export const OPERATOR_KIND_LABEL = {
  correction: 'Korekta (KOR)',
  advance: 'Zaliczka (ZAL)',
  final: 'Faktura rozliczeniowa (ROZ)',
} as const;

type SpecialKind = keyof typeof OPERATOR_KIND_LABEL;
const isSpecialKind = (kind: string | null): kind is SpecialKind =>
  kind === 'correction' || kind === 'advance' || kind === 'final';

/** Wiersz bez danych do odtworzenia zdarzenia (stary dokument albo zwykła bez pozycji). */
export function operatorLegacyDataMessage(kind: string | null): string {
  switch (kind) {
    case 'correction':
      return 'Korekta (KOR) sprzed 00137 (przed wdrożeniem A4b PR1): wiersz nie ma special_data — zdarzenia wysyłki nie da się odtworzyć. Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach runbook ksef-error-codes, „Stary dokument specjalny” (special_data dopisuje serwer — 00137 dopuszcza NULL → wartość), potem na TEST „Tylko uzgodnij”; na PROD korekta czeka na C4 (KOR_HOLD).';
    case 'final':
      return 'Faktura rozliczeniowa (ROZ) sprzed 00137 (przed wdrożeniem A4b PR1): wiersz nie ma special_data — zdarzenia wysyłki nie da się odtworzyć. Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach runbook ksef-error-codes, „Stary dokument specjalny” (special_data dopisuje serwer); ponowienie i uzgodnienie ROZ i tak czekają na C4 (hamulec ROZ we wszystkich środowiskach).';
    case 'advance':
      return 'Zaliczka (ZAL) sprzed 02.10.2026: fa3_data nie ma koperty advanceEnvelope — zdarzenia wysyłki nie da się odtworzyć. Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach brak wyjścia w panelu: po przejęciu wysyłki fa3_data jest zamrożone (00132) — zgłoś fakturę Bartoszowi (runbook ksef-error-codes, „Stary dokument specjalny”).';
    default:
      return OPERATOR_MESSAGES.incomplete;
  }
}

/** Rodzaj wstrzymany w tym środowisku — runner zatrzymałby zlecenie przed KSeF. */
export function operatorKindHeldMessage(kind: string | null): string {
  switch (kind) {
    case 'correction':
      return 'Hamulec korekt na KSeF produkcyjnym (KOR_HOLD) — runner zatrzymałby ponowienie i uzgodnienie przed KSeF i nadpisał kod. Zdejmuje go C4 (docs/runbooks/hamulce-ksef.md). Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”.';
    case 'final':
      return 'Hamulec faktur rozliczeniowych we wszystkich środowiskach (ROZ_HOLD_RECONCILE) — runner zatrzymałby ponowienie i uzgodnienie przed KSeF i nadpisał kod. Zdejmuje go C4 (docs/runbooks/hamulce-ksef.md). Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”.';
    default:
      // Zaliczka jest wstrzymana tylko przy nieznanym środowisku (przyciski odmawiają wcześniej).
      return OPERATOR_MESSAGES.envUnknown;
  }
}

/** Dokument specjalny po dacie wystawienia — pełnej wysyłki z kopii nie zlecamy (decyzja b). */
export function operatorIssueDateMessage(kind: string | null): string {
  const label = isSpecialKind(kind) ? OPERATOR_KIND_LABEL[kind] : 'Dokument specjalny';
  return `${label} z datą wystawienia sprzed dzisiaj — nie zlecamy pełnej wysyłki: worker odmówiłby jej z kodem ISSUE_DATE_PASSED (decyzja 06.10.2026, 00147; do B2). Otwarty wpis sent/intent: „Tylko uzgodnij” (nie wysyła, data nie ma znaczenia). Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach brak wyjścia w panelu do B2 — sprawdź dokument w KSeF i zgłoś go Bartoszowi.`;
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

const off = (reason: string): OperatorButton => ({ enabled: false, reason });

/**
 * „Wyślij ponownie” operatora — ta sama decyzja dla przycisku i akcji
 * (`operatorRequeueAction`); nie zależy od dowodu kontaktu ani otwartego wpisu.
 * Klasa hold zostaje dostępna (operator zdejmuje hamulce; akcja sprawdza wyłącznik).
 */
export function operatorRequeueButton(
  input: Pick<OperatorButtonsInput, 'direction' | 'status' | 'errorCode' | 'invoiceKind' | 'facts' | 'environmentKnown'>,
): OperatorButton {
  const errorClass = sendErrorClassOf(input.errorCode);
  if (input.direction !== 'outgoing') return off(OPERATOR_MESSAGES.incoming);
  if (input.status === 'rejected') return off(OPERATOR_MESSAGES.rejectedToDraft);
  if (input.status !== 'failed') return off(OPERATOR_MESSAGES.onlyFailed);
  if (errorClass === 'terminal') return off(terminalRequeueRefusal(input.errorCode));
  if (errorClass === 'reconcile' && !OPERATOR_REQUEUE_RECONCILE_CODES.includes(input.errorCode as SendErrorCode)) {
    return off(reconcileRequeueRefusal(input.errorCode));
  }
  if (!input.environmentKnown) return off(OPERATOR_MESSAGES.envUnknown);
  if (input.facts.sendData === 'missing') return off(operatorLegacyDataMessage(input.invoiceKind));
  if (input.facts.kindHeld) return off(operatorKindHeldMessage(input.invoiceKind));
  if (input.invoiceKind !== 'regular' && input.facts.issueDatePassed) return off(operatorIssueDateMessage(input.invoiceKind));
  return { enabled: true, reason: null };
}

/**
 * „Tylko uzgodnij” — ta sama decyzja dla przycisku i akcji. Bez sprawdzania
 * klasy i daty (nie wysyła), ale z danymi i rodzajem: runner potrzebuje
 * kompletnego zdarzenia na granicy i zatrzymuje hamulec przed uzgodnieniem.
 */
export function operatorReconcileButton(
  input: Pick<OperatorButtonsInput, 'direction' | 'status' | 'invoiceKind' | 'facts' | 'environmentKnown' | 'openSent'>,
): OperatorButton {
  if (input.direction !== 'outgoing') return off(OPERATOR_MESSAGES.incoming);
  if (input.status !== 'failed' && input.status !== 'rejected') return off(OPERATOR_MESSAGES.notFailedOrRejected);
  if (!input.environmentKnown) return off(OPERATOR_MESSAGES.envUnknown);
  if (input.facts.sendData === 'missing') return off(operatorLegacyDataMessage(input.invoiceKind));
  if (input.facts.kindHeld) return off(operatorKindHeldMessage(input.invoiceKind));
  if (!input.openSent) return off(OPERATOR_MESSAGES.noOpenSent);
  return { enabled: true, reason: null };
}

export function operatorInvoiceButtons(input: OperatorButtonsInput): OperatorButtons {
  const outgoing = input.direction === 'outgoing';
  const failedOrRejected = input.status === 'failed' || input.status === 'rejected';
  const errorClass = sendErrorClassOf(input.errorCode);

  const requeue = operatorRequeueButton(input);
  const reconcile = operatorReconcileButton(input);

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
