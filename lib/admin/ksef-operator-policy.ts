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
 *
 * D-A4-1b-3 PR B (decyzje Bartosza 04.10 i 07.10.2026 (5), (7), (12)):
 * „Zapisz decyzję klienta” (decyzja przekazana przez klienta — operator nie
 * decyduje sam) i „Przypomnij klientowi” (najwyżej raz na 24 h). O obu
 * decyduje widok polityki `duplicateDecisionOptions` (actor operator) — te
 * same reguły co RPC `decide_ksef_duplicate` i blokada z 00148.
 */

import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { formatWarsawDateTime } from '@/lib/format/warsaw-date';
import type {
  DuplicateChoice,
  DuplicateDecisionRefusal,
  DuplicateDecisionView,
  DuplicateRefusalDetail,
} from '@/lib/ksef/duplicate-decision';
import { SEND_ERROR_CODES, sendErrorClassOf, type SendErrorCode } from '@/lib/ksef/send-error-classes';

/**
 * Kody klasy reconcile, przy których „Wyślij ponownie” operatora jest
 * bezpieczne (A4): runner zaczyna od rozstrzygnięcia zamiaru i uzgodnienia
 * otwartego wpisu (A2), treść faktury z dowodem kontaktu jest zamrożona
 * (00132), a KSeF odrzuca drugą fakturę o tym samym numerze (440, a sesja
 * z naszej historii = własny duplikat → `accepted`). Ponowienie tej samej
 * treści nie zrobi więc duplikatu.
 * Poza listą: KSEF_DUPLICATE_RECONCILE (ponowienie powtórzy 440; weryfikację
 * treści powtarza „Tylko uzgodnij” przy otwartym wpisie, a decyzję klienta
 * zapisuje „Zapisz decyzję klienta” — D-A4-1b-3 PR B). ENV_MISMATCH od D-A4-2 (00143) jest klasy terminal: ponowienie
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
  duplicateRequeue: 'KSeF ma już fakturę o tym numerze — ponowienie powtórzy 440. Powody no-own-file i known-number z danymi oryginału: decyzja klienta („Zapisz decyzję klienta” po rozmowie z klientem, „Przypomnij klientowi”). Pobranie oryginału nieudane (download-*, storage-pending, archive-pending), known-number bez danych albo known-stale: „Tylko uzgodnij” przy otwartym wpisie. faktflow-original, same-content-other-program, archive-conflict: runbook KSEF_DUPLICATE_RECONCILE.',
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
  /** „Zapisz decyzję klienta” (D-A4-1b-3 PR B). */
  decide: OperatorButton;
  /** „Przypomnij klientowi” — najwyżej raz na 24 h (decyzja 12). */
  remind: OperatorButton;
}

/** Ślad powiadomień klienta o decyzji (`findDuplicateNotices`) — do „Przypomnij klientowi”. */
export interface DuplicateNoticeSummary {
  count: number;
  lastAt: string | null;
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
  /**
   * D-A4-1b-3 PR B: widok decyzji klienta (`duplicateDecisionOptions`, actor
   * operator) dla failed KSEF_DUPLICATE_RECONCILE; brak — faktura nie czeka
   * na decyzję (oba przyciski wyłączone z powodem `notPending`).
   */
  duplicateDecision?: DuplicateDecisionView | null;
  /** Ślad powiadomień o (fakturze, K); brak — bez powiadomienia. */
  duplicateNotice?: DuplicateNoticeSummary | null;
  /** Chwila odczytu (24 h przypomnienia); domyślnie teraz. */
  now?: Date;
}

/** Odstęp „Przypomnij klientowi” (decyzja 12) — ten sam co w akcji. */
export const OPERATOR_REMIND_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Teksty operatora decyzji klienta przy 440 (2.11.D; bez przeglądu prawnika).
 * `{nr}` numer dokumentu, `{K}` numer KSeF oryginału.
 */
export const OPERATOR_DUPLICATE_MESSAGES = {
  decideButton: 'Zapisz decyzję klienta',
  dialogTitle: (nr: string, k: string) => `Decyzja klienta — ${nr} (faktura w KSeF ${k})`,
  lead: 'Zapisz decyzję przekazaną przez klienta — operator nie decyduje sam (decyzja Bartosza 04.10.2026).',
  choiceSame: 'Klient: to ta sama sprzedaż',
  choiceOther: 'Klient: to inna sprzedaż',
  noteLabel: 'Skąd decyzja (kanał, data, osoba)',
  notePlaceholder: 'np. e-mail od właściciela 05.10, Jan Kowalski',
  noteError: 'Notatka: co najmniej 10 znaków — kanał, data, osoba.',
  /**
   * Pole „Rozumiem skutki” klienta (decyzja 7, C5) — wymagane, gdy `needsConfirmation[choice]`.
   * „Ta sama sprzedaż”: `confirmSame`, gdy tabela zaznacza różnicę (`markedDifference`),
   * inaczej `confirmSameUncomparable` — jak `DIALOG_SAME.CHECKBOX` / `CHECKBOX_UNCOMPARABLE` klienta.
   */
  confirmSame: (k: string, nr: string) =>
    `Klient potwierdził „Rozumiem skutki”: faktura ${k} w KSeF dokumentuje tę samą sprzedaż co dokument ${nr}, mimo różnic w tabeli.`,
  confirmSameUncomparable: (k: string, nr: string) =>
    `Klient potwierdził „Rozumiem skutki”: faktura ${k} w KSeF dokumentuje tę samą sprzedaż co dokument ${nr}, choć części danych w tabeli nie da się porównać.`,
  confirmOther: (k: string, nr: string) =>
    `Klient potwierdził „Rozumiem skutki”: faktura ${k} w KSeF dokumentuje inną sprzedaż niż dokument ${nr}.`,
  confirmMissing: 'Zaznacz potwierdzenie klienta („Rozumiem skutki”) i zapisz jeszcze raz.',
  success: (choice: DuplicateChoice) =>
    `Zapisano decyzję klienta (${choice === 'same_sale' ? 'ta sama sprzedaż' : 'inna sprzedaż'}). Dokument wrócił do szkicu jako wycofany.`,
  remindButton: 'Przypomnij klientowi',
  remindConfirm: (nr: string) => `Wysłać klientowi ponownie e-mail „Faktura ${nr} czeka na Twoją decyzję”?`,
  remindTooSoon: (lastAt: string) =>
    `Ostatnie powiadomienie: ${formatWarsawDateTime(lastAt)} — przypomnienie najwcześniej 24 h później.`,
  remindNoEmail: 'Firma nie ma adresu e-mail właściciela — skontaktuj się z klientem innym kanałem (runbook KSEF_DUPLICATE_RECONCILE).',
  remindReadFailed: 'Nie udało się odczytać adresu e-mail właściciela (błąd bazy albo GoTrue) — spróbuj ponownie za chwilę.',
  remindNotSent: (reason: string) => `Nie wysłano przypomnienia (${reason}).`,
  remindSentNotRecorded: 'Przypomnienie wysłane, ale nie zapisaliśmy śladu w audit_logs — nie wysyłaj go ponownie przez 24 h (klucz Resend chroni tylko dobę).',
  remindSuccess: (email: string) => `Wysłano przypomnienie do ${email}.`,
  // Powody wyłączenia „Zapisz decyzję klienta” i „Przypomnij klientowi”.
  notPending: 'Faktura nie czeka na decyzję klienta (stan albo kod inny niż failed / KSEF_DUPLICATE_RECONCILE).',
  reason: (r: string) =>
    `Powód ${r}: decyzji klienta w panelu jeszcze nie ma (faktflow-original — PR C; same-content-other-program — D-A4-1b-2; archive-conflict — runbook; download-*/storage-pending/archive-pending i known-number bez danych — „Tylko uzgodnij”; ownHistory — runbook).`,
  knownStale: (y: string, k: string) =>
    `known-stale: dokument ${y} nie ma już numeru KSeF ${k} albo nie jest przyjęty w KSeF — „Tylko uzgodnij” powtórzy werdykt; dokument ${y} w stanie failed z numerem KSeF to I9 — najpierw I9.`,
  payments: (paidAmount: string) =>
    `Wpłaty na fakturze (paid_amount ${paidAmount}) — decyzja zablokowana (decyzja Bartosza 07.10.2026 (A)); wpłaty zmieniamy tylko za zgodą Bartosza (runbook, decyzja (6)).`,
  env: (checkEnv: string, appEnv: string) =>
    `original_check.env „${checkEnv}” ≠ KSEF_ENV „${appEnv}” — nie zapisuj decyzji (runbook: przełączenie środowiska; alarm I5D-env).`,
  noCheck: 'no-check: wpis sprzed 00144 — I5 zapisze dane przy ponownym sprawdzeniu.',
  runbook: (code: string) => `${code}: runbook KSEF_DUPLICATE_RECONCILE — sprawdź w KSeF i zgłoś Bartoszowi.`,
  /** Alarm monitora i podpowiedź w tabeli I5D `/admin/ksef` (2.7.4). */
  i5dEnv: 'I5D-env: faktura czeka na decyzję klienta, ale dane oryginału sprawdzono w innym środowisku KSeF niż obecne — klient nie zapisze decyzji (runbook KSEF_DUPLICATE_RECONCILE, przełączenie środowiska).',
} as const;

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
      return 'Korekta (KOR) sprzed 00137 (przed wdrożeniem A4b PR1): wiersz nie ma special_data — zdarzenia wysyłki nie da się odtworzyć. Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach runbook ksef-error-codes, „Stary dokument specjalny” (scripts/ops/dopisz-dane-specjalne.sh — 00137 dopuszcza NULL → wartość tylko serwerowi), potem na TEST „Tylko uzgodnij” przy otwartym wpisie sent/intent albo „Wyślij ponownie” w dniu wystawienia; inaczej brak wyjścia do B2 — zgłoś Bartoszowi; na PROD korekta czeka na C4 (KOR_HOLD).';
    case 'final':
      return 'Faktura rozliczeniowa (ROZ) sprzed 00137 (przed wdrożeniem A4b PR1): wiersz nie ma special_data — zdarzenia wysyłki nie da się odtworzyć. Bez dowodu kontaktu i poza klasą reconcile: „Wróć do szkicu”. W pozostałych przypadkach runbook ksef-error-codes, „Stary dokument specjalny” (scripts/ops/dopisz-dane-specjalne.sh); ponowienie i uzgodnienie ROZ i tak czekają na C4 (hamulec ROZ we wszystkich środowiskach).';
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

/**
 * Powód wyłączenia „Zapisz decyzję klienta” dla kodu odmowy — z widoku
 * polityki (`detail` niesie wartości z faktów) albo z blokady SQL odczytanej
 * przez akcję przypomnienia (`ksef_duplicate_decision_blocker`).
 */
export function operatorDuplicateRefusalReason(
  refusal: DuplicateDecisionRefusal | string,
  detail: DuplicateRefusalDetail | null | undefined,
): string {
  const M = OPERATOR_DUPLICATE_MESSAGES;
  switch (refusal) {
    case 'not-found':
    case 'not-pending':
      return M.notPending;
    case 'payments':
      return M.payments(detail?.paidAmount != null ? String(detail.paidAmount) : 'nieznana');
    case 'env':
      return M.env(detail?.checkEnv ?? 'brak', detail?.environment ?? 'brak');
    case 'env-unknown':
      return OPERATOR_MESSAGES.envUnknown;
    case 'known-stale':
      return M.knownStale(detail?.knownInvoiceNumber ?? 'bez numeru', detail?.originalKsefNumber ?? '(brak)');
    case 'reason':
      return M.reason(detail?.reason ?? 'nieznany');
    case 'no-check':
      return M.noCheck;
    default:
      return M.runbook(refusal);
  }
}

/** „Zapisz decyzję klienta” — tylko widok `decidable` (actor operator). */
export function operatorDuplicateDecisionButton(view: DuplicateDecisionView | null | undefined): OperatorButton {
  if (!view || view.kind === 'decided') return off(OPERATOR_DUPLICATE_MESSAGES.notPending);
  if (view.kind === 'decidable') return { enabled: true, reason: null };
  return off(operatorDuplicateRefusalReason(view.refusal, view.detail));
}

/**
 * „Przypomnij klientowi” — gdy decyzja jest możliwa i od ostatniego
 * powiadomienia o (fakturze, K) minęły co najmniej 24 h (decyzja 12).
 * Faktura nigdy niepowiadomiona (zaległość sprzed PR B) — od razu.
 */
export function operatorRemindButton(
  decide: OperatorButton,
  notice: DuplicateNoticeSummary | null | undefined,
  now: Date,
): OperatorButton {
  if (!decide.enabled) return decide;
  const lastAt = notice?.lastAt ?? null;
  if (lastAt !== null) {
    const last = Date.parse(lastAt);
    if (Number.isNaN(last) || now.getTime() - last < OPERATOR_REMIND_INTERVAL_MS) {
      return off(OPERATOR_DUPLICATE_MESSAGES.remindTooSoon(lastAt));
    }
  }
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

  const decide = operatorDuplicateDecisionButton(input.duplicateDecision);
  const remind = operatorRemindButton(decide, input.duplicateNotice, input.now ?? new Date());

  return { requeue, reconcile, reset, decide, remind };
}
