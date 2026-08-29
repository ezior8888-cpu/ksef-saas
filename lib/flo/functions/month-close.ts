/**
 * B-01 — domknięcie miesiąca (krok 41 planu). ⚠️ PROMIEŃ RAŻENIA 4.
 *
 * Paczka z danymi finansowymi firmy wychodzi do OBCEJ OSOBY. Tego się nie
 * cofa: zła zawartość zostaje zaksięgowana, zły adres zostaje przeczytany.
 * Dlatego ta funkcja jest w kilku miejscach celowo niewygodna.
 *
 * TRZY AWARIE:
 *
 * 1. NIEKOMPLETNA PACZKA U KSIĘGOWEJ. Miesiąc wysłany, zanim skrzynka KSeF
 *    została pobrana do końca albo póki leżą nieprzejrzane koszty. Księgowa
 *    księguje niepełny miesiąc, a poprawka wychodzi po jej stronie, przy
 *    deklaracji. Obrona: TRZY WARUNKI sprawdzane przed pokazaniem karty
 *    I PONOWNIE przy kliknięciu. Karta w ogóle nie powstaje, dopóki miesiąc
 *    nie jest kompletny — pokazywanie „wyślij mimo braków” byłoby zaproszeniem.
 *
 * 2. ZŁY ADRES KSIĘGOWEJ. Literówka w domenie oznacza, że komplet danych
 *    finansowych firmy trafia do obcego człowieka. Obrona: adres wpisywany
 *    ręcznie, potwierdzany osobno PRZED PIERWSZĄ WYSYŁKĄ i zapamiętywany
 *    DOPIERO PO UDANYM DORĘCZENIU. Adres, z którego przyszło odbicie, nie ma
 *    prawa zostać w bazie jako „ten sprawdzony”.
 *
 * 3. CICHE DOSŁANIE SPÓŹNIONEGO DOKUMENTU. Faktura przychodzi po zamknięciu
 *    i wysłaniu miesiąca. Ciche dosłanie zostawia księgową z dwiema paczkami,
 *    które różnią się niewidocznie — a ona nie ma jak zgadnąć, którą
 *    zaksięgowała. Obrona: propozycja ANEKSU, nazywająca dokument po numerze
 *    i kwocie. Nigdy ciche dosłanie.
 *
 * CZWARTA RZECZ, KTÓRA NIE JEST AWARIĄ, TYLKO ZASADĄ: cisza po wysyłce jest
 * stanem zabronionym. Po każdej wysyłce powstaje meldunek — doręczono albo
 * odbiło się.
 */

import {
  formatChangeAction,
  importFailureAction,
  type AccountantFormat,
} from '@/lib/flo/functions/accountant-format';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPln } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';

const DAY_MS = 86_400_000;

/** W których dniach miesiąca agent proponuje domknięcie poprzedniego. */
export const CLOSE_WINDOW_DAYS = [1, 2, 3] as const;

// ═══════════════════════════════════════════════════════════════
// Trzy warunki
// ═══════════════════════════════════════════════════════════════

export interface CloseReadiness {
  /** Kontrola z kroku 19: skrzynka KSeF pobrana do końca okresu. */
  inboxFullyFetched: boolean;
  /** Ile dokumentów kosztowych czeka na decyzję człowieka. */
  unreviewedDocuments: number;
  /** Ile faktur widzi KSeF za ten okres. */
  ksefInvoiceCount: number;
  /** Ile faktur mamy u siebie. */
  localInvoiceCount: number;
}

export type CloseBlocker =
  | 'inbox_incomplete'
  | 'unreviewed_documents'
  | 'count_mismatch';

/**
 * Trzy warunki. Pusta lista = miesiąc wolno domknąć.
 *
 * Kolejność w wyniku jest stała, żeby komunikat operatorski i test nie
 * zależały od kolejności sprawdzeń.
 */
export function checkReadiness(readiness: CloseReadiness): CloseBlocker[] {
  const blockers: CloseBlocker[] = [];

  if (!readiness.inboxFullyFetched) blockers.push('inbox_incomplete');
  if (readiness.unreviewedDocuments > 0) blockers.push('unreviewed_documents');
  if (readiness.ksefInvoiceCount !== readiness.localInvoiceCount) {
    blockers.push('count_mismatch');
  }

  return blockers;
}

// ═══════════════════════════════════════════════════════════════
// Adres księgowej
// ═══════════════════════════════════════════════════════════════

export type AddressState =
  /** Nie znamy adresu — pytamy. */
  | { kind: 'ask' }
  /** Adres jest, ale nic jeszcze pod niego nie doszło — potwierdzamy. */
  | { kind: 'confirm'; email: string }
  /** Pod ten adres coś już doszło — nie zawracamy głowy. */
  | { kind: 'known'; email: string };

export function addressState(input: {
  email: string | null;
  /** Czy pod ten adres KIEDYKOLWIEK udało się doręczyć paczkę. */
  deliveredBefore: boolean;
}): AddressState {
  if (!input.email) return { kind: 'ask' };
  if (!input.deliveredBefore) return { kind: 'confirm', email: input.email };
  return { kind: 'known', email: input.email };
}

/**
 * Czy zapamiętać adres po próbie wysyłki.
 *
 * WYŁĄCZNIE po udanym doręczeniu. Adres, z którego przyszło odbicie, zapisany
 * jako „sprawdzony” zamieniłby jednorazową literówkę w trwały błąd: kolejne
 * miesiące szłyby pod niego już bez pytania.
 */
export function shouldRememberAddress(delivery: { delivered: boolean }): boolean {
  return delivery.delivered;
}

// ═══════════════════════════════════════════════════════════════
// Decyzja
// ═══════════════════════════════════════════════════════════════

export interface ChecklistItem {
  /** Klucz funkcji, z której pochodzi pozycja — do dowodów. */
  source: 'W-02' | 'K-01' | 'T-05';
  label: string;
}

export interface MonthCloseInput {
  /** Okres, który domykamy, np. „2026-08”. */
  periodKey: string;
  readiness: CloseReadiness;
  /** Pary paragon–faktura z W-02. */
  receiptPairs: number;
  /** Pozycje oznaczone jako zapłacone bez potwierdzonej wpłaty (K-01). */
  paidWithoutPayment: number;
  /** Zdanie korekty licznika odkładania (T-05), jeżeli jest. */
  setAsideCorrection?: string | null;
  /** Czy paczka za ten okres już poszła. */
  alreadySent: boolean;
  today: Date;
}

export type CloseVerdict =
  | { kind: 'silent'; reason: 'outside_window' | 'already_sent' }
  | { kind: 'blocked'; blockers: CloseBlocker[] }
  | { kind: 'ready'; checklist: ChecklistItem[] };

export function decideMonthClose(input: MonthCloseInput): CloseVerdict {
  if (input.alreadySent) return { kind: 'silent', reason: 'already_sent' };

  const dayOfMonth = input.today.getUTCDate();
  if (!(CLOSE_WINDOW_DAYS as readonly number[]).includes(dayOfMonth)) {
    return { kind: 'silent', reason: 'outside_window' };
  }

  const blockers = checkReadiness(input.readiness);
  // Karta NIE POWSTAJE, dopóki miesiąc nie jest kompletny. Pokazanie jej
  // z dopiskiem „wyślij mimo braków" byłoby zaproszeniem do wysłania
  // niepełnej paczki — a to jest dokładnie ta awaria, której unikamy.
  if (blockers.length > 0) return { kind: 'blocked', blockers };

  return { kind: 'ready', checklist: buildChecklist(input) };
}

function buildChecklist(input: MonthCloseInput): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];

  if (input.receiptPairs > 0) {
    checklist.push({
      source: 'W-02',
      label: `${input.receiptPairs} ${pairWord(input.receiptPairs)} paragon–faktura w komplecie`,
    });
  }

  if (input.paidWithoutPayment > 0) {
    checklist.push({
      source: 'K-01',
      label: `${input.paidWithoutPayment} ${positionWord(input.paidWithoutPayment)} oznaczonych jako zapłacone bez potwierdzonej wpłaty`,
    });
  }

  if (input.setAsideCorrection) {
    checklist.push({ source: 'T-05', label: input.setAsideCorrection });
  }

  return checklist;
}

// ═══════════════════════════════════════════════════════════════
// Propozycja domknięcia
// ═══════════════════════════════════════════════════════════════

export function buildMonthClosePackageProposal(input: {
  tenantId: string;
  close: MonthCloseInput;
  address: AddressState;
  /** Ile dokumentów wchodzi do paczki. */
  documentCount: number;
  /** Format, w którym pójdzie paczka — do przycisku zmiany (B-02). */
  currentFormat?: AccountantFormat;
}): CreateProposalInput | null {
  const verdict = decideMonthClose(input.close);
  if (verdict.kind !== 'ready') return null;

  const { periodKey } = input.close;
  const asking = input.address.kind !== 'known';

  return {
    tenantId: input.tenantId,
    kind: 'accountant.package',
    topicKey: `accountant.package:${periodKey}`,
    title: `Miesiąc ${periodKey} domknięty`,
    body:
      `${input.documentCount} ${documentWord(input.documentCount)} w komplecie. ` +
      describeChecklist(verdict.checklist) +
      (input.address.kind === 'known'
        ? `Wysłać paczkę na ${input.address.email}?`
        : input.address.kind === 'confirm'
          ? `Wysyłam do ${input.address.email} — zgadza się?`
          : 'Na jaki adres wysłać ją księgowej?'),
    fingerprint: fingerprintOf({
      period: periodKey,
      documents: input.documentCount,
      checklist: verdict.checklist.map((item) => item.label).join('|'),
    }),
    // Domknięcie ma sens do końca miesiąca, w którym powstało; potem
    // księgowa i tak dopomina się sama.
    expiresAt: new Date(input.close.today.getTime() + 27 * DAY_MS),
    priority: 8,
    payload: {
      periodKey,
      documentCount: input.documentCount,
      checklist: verdict.checklist,
      // Adres wpisywany RĘCZNIE, także wtedy, gdy już go znamy i tylko
      // potwierdzamy — pole z gotową wartością do sprawdzenia, nie
      // milcząca zgoda przez kliknięcie „wyślij".
      inputLabel: asking ? 'Adres e-mail księgowej' : 'Potwierdź adres',
      inputKind: 'email',
      prefilledEmail: input.address.kind === 'ask' ? null : input.address.email,
      needsAddressConfirmation: input.address.kind === 'confirm',
      primaryLabel: 'Wyślij paczkę',
      // B-02: format zmienia się STĄD, nie z ustawień. Moment, w którym
      // klient myśli o księgowej, to moment wysyłania jej paczki; ustawienia
      // odwiedza raz w życiu, przy zakładaniu konta.
      ...(input.currentFormat
        ? {
            format: input.currentFormat,
            secondary: [
              formatChangeAction(input.currentFormat),
              { label: 'Nie teraz', intent: 'snooze' },
            ],
            correction: 'change_accountant_format',
          }
        : {}),
    },
    evidence: buildCloseEvidence(verdict.checklist, periodKey),
  };
}

function describeChecklist(checklist: ChecklistItem[]): string {
  if (checklist.length === 0) return 'Nic nie zostało do wyjaśnienia. ';
  return `${checklist.map((item) => item.label).join('; ')}. `;
}

function buildCloseEvidence(checklist: ChecklistItem[], periodKey: string) {
  const evidence = [
    { label: `Dokumenty okresu ${periodKey}`, href: '/invoices' },
    { label: 'Wysłane paczki', href: '/settings/accountant' },
  ];

  if (checklist.some((item) => item.source === 'K-01')) {
    evidence.push({ label: 'Płatności do potwierdzenia', href: '/payments' });
  }

  return evidence;
}

// ═══════════════════════════════════════════════════════════════
// Ponowne sprawdzenie przy kliknięciu — promień 4
// ═══════════════════════════════════════════════════════════════

export type SendRecheck =
  | { ok: true }
  | { ok: false; reason: 'stale' | 'blocked'; message: string };

/**
 * Druga kontrola, tuż przed wysyłką.
 *
 * Między pokazaniem karty a kliknięciem mija zwykle kilka godzin: w tym
 * czasie mogła dojść faktura z KSeF albo klient mógł wgrać koszt. Zgoda
 * dotyczyła KOMPLETNEGO miesiąca — jeżeli miesiąc przestał być kompletny,
 * zgoda przestała obowiązywać.
 */
export function recheckBeforeSend(input: {
  readiness: CloseReadiness;
  address: AddressState;
  /** Adres wpisany albo potwierdzony przez człowieka w tym kliknięciu. */
  confirmedEmail: string | null;
}): SendRecheck {
  const blockers = checkReadiness(input.readiness);
  if (blockers.length > 0) {
    return {
      ok: false,
      reason: 'stale',
      message: 'W międzyczasie doszły nowe dokumenty. Domknę miesiąc jeszcze raz.',
    };
  }

  // Adres musi paść z ręki człowieka przy KAŻDEJ wysyłce pod adres, pod
  // który jeszcze nic nie doszło. Wysyłka bez tego byłaby zgodą przez
  // milczenie na adres, którego nikt nie przeczytał.
  if (input.address.kind !== 'known' && !input.confirmedEmail) {
    return {
      ok: false,
      reason: 'blocked',
      message: 'Potwierdź adres księgowej, zanim wyślę paczkę.',
    };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// Meldunek po wysyłce — cisza jest stanem zabronionym
// ═══════════════════════════════════════════════════════════════

export interface DeliveryOutcome {
  delivered: boolean;
  email: string;
  /** Powód odbicia w słowach księgowej poczty, jeżeli był. */
  bounceReason?: string;
}

export function buildDeliveryProposal(input: {
  tenantId: string;
  periodKey: string;
  outcome: DeliveryOutcome;
  /** Format, w którym poszła paczka — do zgłoszenia nieudanego importu. */
  format?: AccountantFormat;
  now?: Date;
}): CreateProposalInput {
  const now = input.now ?? new Date();
  const { outcome } = input;

  return {
    tenantId: input.tenantId,
    kind: 'accountant.delivery',
    topicKey: `accountant.delivery:${input.periodKey}`,
    title: outcome.delivered
      ? `Paczka za ${input.periodKey} doręczona`
      : `Paczka za ${input.periodKey} NIE doszła`,
    body: outcome.delivered
      ? `Serwer księgowej przyjął przesyłkę na ${outcome.email}.`
      : `Wysyłka na ${outcome.email} odbiła się${outcome.bounceReason ? `: ${outcome.bounceReason}` : ''}. Adres nie został zapamiętany — sprawdź go i spróbujmy jeszcze raz.`,
    fingerprint: fingerprintOf({
      period: input.periodKey,
      delivered: outcome.delivered ? 1 : 0,
      email: outcome.email,
    }),
    expiresAt: new Date(now.getTime() + 14 * DAY_MS),
    // Odbicie jest pilne: klient jest przekonany, że księgowa ma komplet.
    priority: outcome.delivered ? 60 : 5,
    payload: {
      periodKey: input.periodKey,
      delivered: outcome.delivered,
      primaryIntent: 'open',
      primaryLabel: outcome.delivered ? 'Zobacz paczkę' : 'Popraw adres',
      // B-02: zgłoszenie nieudanego importu jednym kliknięciem, w wątku.
      // Doręczenie nie znaczy, że plik wszedł do programu księgowej —
      // a maila do wsparcia klient nie napisze.
      ...(outcome.delivered && input.format
        ? {
            format: input.format,
            secondary: [importFailureAction(), { label: 'Ukryj', intent: 'dismiss' }],
            correction: 'format_import_failed',
          }
        : {}),
    },
    evidence: [{ label: 'Wysłane paczki', href: '/settings/accountant' }],
  };
}

// ═══════════════════════════════════════════════════════════════
// Spóźniony dokument — aneks, nigdy ciche dosłanie
// ═══════════════════════════════════════════════════════════════

export interface LateDocument {
  id: string;
  number: string;
  contractorName: string;
  gross: number;
  /** ISO — data wpływu do nas, nie data wystawienia. */
  arrivedOn: string;
}

/**
 * Propozycja aneksu do wysłanej już paczki.
 *
 * NIGDY nie dosyłamy po cichu. Księgowa z dwiema paczkami, które różnią się
 * niewidocznie, nie ma jak zgadnąć, którą zaksięgowała — a odpowiedzialność
 * za to spadnie na klienta, nie na nas.
 */
export function buildAnnexProposal(input: {
  tenantId: string;
  periodKey: string;
  documents: readonly LateDocument[];
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.documents.length === 0) return null;

  const total = input.documents.reduce((sum, doc) => sum + doc.gross, 0);

  return {
    tenantId: input.tenantId,
    kind: 'accountant.package',
    // Osobny temat od paczki: aneks nie może podmienić karty domknięcia,
    // bo to dwie różne zgody na dwie różne przesyłki.
    topicKey: `accountant.annex:${input.periodKey}`,
    title: `Spóźniony dokument do zamkniętego miesiąca ${input.periodKey}`,
    body:
      `${describeLate(input.documents)} Łącznie ${formatPln(total)}. ` +
      'Wyślę księgowej aneks z tym jednym dokumentem — będzie wiedziała, ' +
      'co doszło po paczce.',
    fingerprint: fingerprintOf({
      period: input.periodKey,
      documents: input.documents.map((doc) => doc.id).join('|'),
    }),
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    priority: 18,
    payload: {
      periodKey: input.periodKey,
      documentIds: input.documents.map((doc) => doc.id),
      isAnnex: true,
      inputLabel: 'Potwierdź adres',
      inputKind: 'email',
      primaryLabel: 'Wyślij aneks',
    },
    evidence: input.documents.map((doc) => ({
      label: `${doc.number} — ${doc.contractorName}`,
      href: `/invoices/${doc.id}`,
    })),
  };
}

function describeLate(documents: readonly LateDocument[]): string {
  if (documents.length === 1) {
    const [doc] = documents;
    return `${doc!.number} od ${doc!.contractorName} wpłynęła ${formatDayMonth(doc!.arrivedOn)}, już po wysłaniu paczki.`;
  }
  return `${documents.length} dokumenty wpłynęły już po wysłaniu paczki.`;
}

// ═══════════════════════════════════════════════════════════════
// Odmiana
// ═══════════════════════════════════════════════════════════════

function documentWord(count: number): string {
  return count === 1 ? 'dokument' : plural(count, 'dokumenty', 'dokumentów');
}

function pairWord(count: number): string {
  return count === 1 ? 'para' : plural(count, 'pary', 'par');
}

function positionWord(count: number): string {
  return count === 1 ? 'pozycja' : plural(count, 'pozycje', 'pozycji');
}

function plural(count: number, few: string, many: string): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isFew =
    lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return isFew ? few : many;
}

function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}.${month}`;
}
