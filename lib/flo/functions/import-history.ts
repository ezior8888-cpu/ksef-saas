/**
 * O-02 — podłączenie KSeF i import historii (krok 46 planu).
 *
 * To jest JEDYNA DROGA WEJŚCIA DANYCH do produktu i pierwsza rzecz, jaką
 * klient robi po założeniu konta. Jeżeli tu coś pójdzie nie tak, klient nie
 * dochodzi do żadnej innej funkcji — więc ta funkcja ma jeden obowiązek
 * ponad wszystkie inne: nie skłamać o tym, co się właśnie stało.
 *
 * TRZY RZECZY, KTÓRE MUSZĄ BYĆ PRAWDZIWE:
 *
 * 1. POWTÓRNY IMPORT NIE TWORZY DRUGIEGO REKORDU. Import bywa przerywany
 *    (restart kontenera, timeout, 5xx z MF) i wznawiany. Numer KSeF jest
 *    globalnie unikalny i to on jest odciskiem — nie numer własny klienta,
 *    który po imporcie z dwóch programów potrafi się powtórzyć.
 *    Odsiewamy też duplikaty WEWNĄTRZ paczki: przy stronicowaniu z nakładką
 *    ten sam dokument wraca na dwóch stronach.
 *
 * 2. DOKUMENTY Z IMPORTU SĄ WYKLUCZONE Z OCENY I Z KONTROLI NUMERACJI.
 *    Historia z KSeF nie niesie informacji, kiedy faktura została zapłacona —
 *    wpuszczenie jej do K-03 dałoby każdemu kontrahentowi ocenę „nie płaci”.
 *    Numeracja zaimportowana pochodzi z innego programu, więc kontrola
 *    ciągłości alarmowałaby o luce u każdego, kto cokolwiek zaimportował.
 *    Znacznik jest w kolumnie `invoices.origin` (migracja 00065), a nie
 *    w `notes` — bo notatkę klient może zmienić i wtedy dokument po cichu
 *    wraca do obu mechanizmów.
 *
 * 3. AGENT MÓWI WPROST, CZEGO NIE MOŻE. Po podłączeniu sprawdzamy środowisko
 *    i zakres uprawnień. Token do środowiska testowego albo token bez prawa
 *    wysyłki to normalne sytuacje — nienormalne jest dowiedzenie się o nich
 *    dopiero przy pierwszej nieudanej wysyłce faktury.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════
// Pochodzenie dokumentu
// ═══════════════════════════════════════════════════════════════

export const INVOICE_ORIGINS = [
  'app',
  'ksef_import',
  'ksef_inbox',
  'file_import',
  'ocr',
] as const;

export type InvoiceOrigin = (typeof INVOICE_ORIGINS)[number];

export function isInvoiceOrigin(value: string): value is InvoiceOrigin {
  return (INVOICE_ORIGINS as readonly string[]).includes(value);
}

/** Wszystko, co nie powstało w aplikacji. */
export function isImported(origin: string): boolean {
  return origin !== 'app';
}

/**
 * Czy dokument liczy się do oceny terminowości kontrahenta (K-03).
 *
 * Historia z KSeF nie niesie dat zapłaty. Liczenie jej do oceny dałoby
 * każdemu kontrahentowi ocenę „nie płaci” — czyli funkcja, która ma budować
 * zaufanie do liczb agenta, produkowałaby same nieprawdy.
 */
export function countsForPaymentScore(origin: string): boolean {
  return origin === 'app';
}

/**
 * Czy dokument liczy się do kontroli ciągłości numeracji.
 *
 * Zaimportowana numeracja pochodzi z innego programu i ma inny format.
 * Wpuszczenie jej do kontroli oznacza alarm o luce u KAŻDEGO konta, które
 * cokolwiek zaimportowało — czyli u wszystkich, bo import jest pierwszym
 * krokiem w produkcie.
 */
export function countsForNumberingAudit(origin: string): boolean {
  return origin === 'app';
}

// ═══════════════════════════════════════════════════════════════
// Sprawdzenie połączenia
// ═══════════════════════════════════════════════════════════════

export type KsefEnvironment = 'test' | 'production';

export interface ConnectionState {
  environment: KsefEnvironment;
  /** Uprawnienia z tokenu, np. ['InvoiceRead', 'InvoiceWrite']. */
  scopes: readonly string[];
}

export interface ConnectionVerdict {
  /** Czy w ogóle da się cokolwiek zaciągnąć. */
  canRead: boolean;
  /** Czy agent będzie mógł wysyłać faktury po zatwierdzeniu przez człowieka. */
  canSend: boolean;
  /** Czy dokumenty z tego połączenia są prawdziwe. */
  isRealData: boolean;
  /** Zdanie mówiące WPROST, czego agent nie może. Puste = wszystko gra. */
  limitation: string;
}

const READ_SCOPES = ['InvoiceRead', 'CredentialsRead'];
const WRITE_SCOPES = ['InvoiceWrite'];

/**
 * Co potrafimy na tym połączeniu — funkcja czysta.
 *
 * Zdanie o ograniczeniu pada PO PODŁĄCZENIU, a nie przy pierwszej nieudanej
 * wysyłce. Klient, który dowiaduje się o braku uprawnień w chwili wystawiania
 * faktury, ma problem dziś; klient, który dowiaduje się przy podłączaniu,
 * ma zadanie na spokojnie.
 */
export function checkConnection(state: ConnectionState): ConnectionVerdict {
  const canRead = state.scopes.some((scope) => READ_SCOPES.includes(scope));
  const canSend = state.scopes.some((scope) => WRITE_SCOPES.includes(scope));
  const isRealData = state.environment === 'production';

  return {
    canRead,
    canSend,
    isRealData,
    limitation: describeLimitation({ canRead, canSend, isRealData }),
  };
}

function describeLimitation(v: {
  canRead: boolean;
  canSend: boolean;
  isRealData: boolean;
}): string {
  if (!v.isRealData) {
    return 'To jest połączenie ze środowiskiem TESTOWYM KSeF. Faktury, które tu zobaczysz, nie są prawdziwymi dokumentami, a wysyłka nie ma skutków podatkowych.';
  }
  if (!v.canRead) {
    return 'Ten token nie pozwala mi czytać faktur, więc nie zaciągnę historii. Potrzebne jest uprawnienie do odczytu.';
  }
  if (!v.canSend) {
    return 'Ten token pozwala mi tylko czytać. Nie wyślę z niego żadnej faktury — nawet po Twoim zatwierdzeniu.';
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════
// Odcisk na numerze KSeF
// ═══════════════════════════════════════════════════════════════

export interface ImportCandidate {
  /** Numer KSeF — globalnie unikalny. `null` = dokument bez numeru. */
  ksefNumber: string | null;
  /** Numer własny klienta; do komunikatów, NIE do deduplikacji. */
  invoiceNumber: string;
}

/** Numery KSeF różniące się białymi znakami i wielkością liter są tym samym. */
export function normalizeKsefNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export interface DedupeResult<T> {
  toImport: T[];
  /** Odrzucone jako już istniejące. */
  duplicates: T[];
  /** Bez numeru KSeF — nie da się ich odcisnąć, idą do przeglądu ręcznego. */
  withoutKsefNumber: T[];
}

/**
 * Odsianie duplikatów po numerze KSeF — funkcja czysta.
 *
 * Odsiewamy w DWÓCH wymiarach: wobec tego, co już mamy w bazie, i wewnątrz
 * samej paczki. Ten drugi jest równie ważny: stronicowanie z nakładką
 * zwraca ten sam dokument na dwóch stronach, a import „od zera po restarcie”
 * potrafi zdublować całą stronę.
 *
 * Dokument BEZ numeru KSeF nie jest importowany po cichu. Nie da się go
 * odcisnąć, więc przy kolejnym przebiegu wjechałby drugi raz — a faktura
 * w dwóch egzemplarzach psuje wszystko, co liczy się z faktur.
 */
export function dedupeByKsefNumber<T extends ImportCandidate>(
  incoming: readonly T[],
  existing: ReadonlySet<string>,
): DedupeResult<T> {
  const normalizedExisting = new Set(
    [...existing].map((value) => normalizeKsefNumber(value)),
  );
  const seenInBatch = new Set<string>();

  const toImport: T[] = [];
  const duplicates: T[] = [];
  const withoutKsefNumber: T[] = [];

  for (const candidate of incoming) {
    if (!candidate.ksefNumber) {
      withoutKsefNumber.push(candidate);
      continue;
    }

    const key = normalizeKsefNumber(candidate.ksefNumber);
    if (normalizedExisting.has(key) || seenInBatch.has(key)) {
      duplicates.push(candidate);
      continue;
    }

    seenInBatch.add(key);
    toImport.push(candidate);
  }

  return { toImport, duplicates, withoutKsefNumber };
}

// ═══════════════════════════════════════════════════════════════
// Wznawianie
// ═══════════════════════════════════════════════════════════════

export interface ImportProgress {
  /** Ile dokumentów KSeF zapowiedział dla tego okna. */
  announced: number;
  /** Ile już zapisaliśmy. */
  saved: number;
  /** Token paginacji z ostatniej UDANEJ strony. */
  continuationToken: string | null;
  /** Kiedy ostatnio udało się zapisać stronę; ISO. */
  lastPageAt: string | null;
}

/** Po tylu godzinach bez postępu uznajemy przebieg za porzucony. */
export const STALLED_AFTER_HOURS = 6;

export type ResumePlan =
  | { action: 'continue'; from: string; remaining: number }
  | { action: 'restart'; reason: 'no_token' | 'stalled' }
  | { action: 'done' };

/**
 * Skąd wznowić import — funkcja czysta.
 *
 * Wznawianie „od zera” po każdym przerwaniu jest kosztowne dla API MF
 * i wolne dla klienta, ale nie jest niebezpieczne: przed duplikatami broni
 * odcisk na numerze KSeF, nie ten mechanizm. Dlatego przy jakiejkolwiek
 * wątpliwości wybieramy restart, a nie kontynuację z tokenem, którego
 * świeżości nie jesteśmy pewni.
 */
export function planResume(progress: ImportProgress, now: Date): ResumePlan {
  if (progress.announced > 0 && progress.saved >= progress.announced) {
    return { action: 'done' };
  }
  if (!progress.continuationToken) return { action: 'restart', reason: 'no_token' };

  if (progress.lastPageAt) {
    const since = now.getTime() - Date.parse(progress.lastPageAt);
    if (since > STALLED_AFTER_HOURS * 3_600_000) {
      // Token paginacji po stronie MF ma swój termin ważności; kontynuacja
      // wygasłym tokenem kończy się błędem, którego nie da się odróżnić
      // od awarii.
      return { action: 'restart', reason: 'stalled' };
    }
  }

  return {
    action: 'continue',
    from: progress.continuationToken,
    remaining: Math.max(0, progress.announced - progress.saved),
  };
}

// ═══════════════════════════════════════════════════════════════
// Podsumowanie po imporcie
// ═══════════════════════════════════════════════════════════════

export interface ImportSummary {
  invoices: number;
  /** Kontrahenci, dla których jest więcej niż jedna faktura. */
  regularContractors: number;
  /** Faktury bez zapłaty na dzień importu. */
  unpaid: number;
  /** Miesiąc najstarszej niezapłaconej, np. „czerwca”; opcjonalny. */
  unpaidSince?: string | null;
  /** Ile dokumentów odrzucono jako duplikaty — do dowodów, nie do treści. */
  duplicatesSkipped: number;
}

/**
 * „Mam 143 Twoje faktury z KSeF. Widzę 4 stałych klientów i 2 niezapłacone.”
 *
 * Pierwsze zdanie, jakie agent mówi nowemu klientowi. Musi być prawdziwe co
 * do liczby i musi pokazywać, że dane zostały ZROZUMIANE, a nie tylko
 * przepisane — stąd stali klienci i niezapłacone, a nie sam licznik faktur.
 */
export function buildImportDoneProposal(input: {
  tenantId: string;
  summary: ImportSummary;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const { summary } = input;

  if (summary.invoices === 0) return null;

  return {
    tenantId: input.tenantId,
    kind: 'import.done',
    topicKey: 'import.done',
    title: `Mam ${summary.invoices} ${invoiceWord(summary.invoices)} z KSeF`,
    body: [
      describeContractors(summary.regularContractors),
      describeUnpaid(summary.unpaid, summary.unpaidSince ?? null),
    ]
      .filter(Boolean)
      .join(' '),
    fingerprint: fingerprintOf({
      invoices: summary.invoices,
      contractors: summary.regularContractors,
      unpaid: summary.unpaid,
    }),
    expiresAt: new Date(now.getTime() + 14 * DAY_MS),
    priority: 30,
    payload: {
      invoices: summary.invoices,
      regularContractors: summary.regularContractors,
      unpaid: summary.unpaid,
      primaryIntent: 'open',
      primaryLabel: 'Zobacz faktury',
    },
    evidence: [
      { label: 'Zaimportowane faktury', href: '/invoices' },
      { label: 'Kontrahenci', href: '/contractors' },
      ...(summary.duplicatesSkipped > 0
        ? [
            {
              label: `Pominięte duplikaty: ${summary.duplicatesSkipped}`,
              href: '/invoices',
            },
          ]
        : []),
    ],
  };
}

function describeContractors(count: number): string {
  if (count === 0) return '';
  // „Widzę N stałych klientów" jest poprawne dla każdego N ≥ 2: biernik
  // rzeczownika męskoosobowego równa się dopełniaczowi, więc forma nie
  // rozgałęzia się tak jak przy fakturach niżej.
  return count === 1
    ? 'Widzę 1 stałego klienta.'
    : `Widzę ${count} stałych klientów.`;
}

function describeUnpaid(count: number, since: string | null): string {
  if (count === 0) return 'Wszystko rozliczone.';
  const tail = since ? ` z ${since}` : '';
  return count === 1
    ? `Jedna faktura jest niezapłacona${tail}.`
    : `${count} ${count >= 2 && count <= 4 ? 'faktury są niezapłacone' : 'faktur jest niezapłaconych'}${tail}.`;
}

function invoiceWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (count === 1) return 'Twoją fakturę';
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return 'Twoje faktury';
  }
  return 'Twoich faktur';
}
