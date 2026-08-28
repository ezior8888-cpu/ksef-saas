/**
 * W-02 — koszty ze skrzynki KSeF (krok 19 planu).
 *
 * Faktury kosztowe przychodzą same. Agent ma je rozpoznać, zaksięgować to,
 * co da się zaksięgować bez zgadywania, i powiedzieć o wszystkim JEDNYM
 * zdaniem zamiast pięcioma powiadomieniami.
 *
 * TRZY AWARIE, KTÓRE TU ZAMYKAMY:
 *
 * 1. CUDZA FAKTURA. Kontrahent pomylił NIP i wystawił dokument na naszego
 *    klienta. Nieznany sprzedawca powyżej progu trafia do „do decyzji",
 *    nigdy prosto do księgi.
 *
 * 2. TEN SAM ZAKUP DWA RAZY. Paragon z telefonu i faktura z KSeF za to samo
 *    paliwo. Zestawiamy pary, ale WYŁĄCZNIE jako linijkę w domknięciu
 *    miesiąca — bez powiadomienia i bez słowa „duplikat", bo to brzmi jak
 *    zarzut, a klient nie zrobił nic złego.
 *
 * 3. URWANE POBIERANIE. Najgroźniejsza z trzech, bo cicha. Strona druga
 *    z pięciu nie doszła, okno dat się przesunęło i część faktur nigdy nie
 *    trafia do klienta. Brakujący koszt to zawyżony podatek — klient traci
 *    pieniądze i nie ma jak się dowiedzieć, że powinien czegoś szukać.
 */

import { formatPlnPlain } from '@/lib/flo/money';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

// ═══════════════════════════════════════════════════════════════
// Klasyfikacja dokumentów
// ═══════════════════════════════════════════════════════════════

/** Nieznany sprzedawca powyżej tej kwoty nie trafia sam do księgi. */
const UNKNOWN_SELLER_LIMIT_PLN = 500;

export interface InboxDocument {
  id: string;
  sellerName: string | null;
  sellerNip: string | null;
  grossAmount: number;
  issueDate: string;
}

export type InboxDecision = 'recognized' | 'needs_decision';

export interface ClassifiedDocument extends InboxDocument {
  decision: InboxDecision;
  reason?: string;
}

export function classifyInboxDocuments(
  documents: readonly InboxDocument[],
  knownSellerNips: ReadonlySet<string>,
): ClassifiedDocument[] {
  return documents.map((doc) => {
    const known = doc.sellerNip ? knownSellerNips.has(doc.sellerNip) : false;

    if (!known && doc.grossAmount > UNKNOWN_SELLER_LIMIT_PLN) {
      return {
        ...doc,
        decision: 'needs_decision',
        reason: 'nieznany sprzedawca',
      };
    }

    if (!doc.sellerName || !doc.sellerNip) {
      return {
        ...doc,
        decision: 'needs_decision',
        reason: 'niepełne dane sprzedawcy',
      };
    }

    return { ...doc, decision: 'recognized' };
  });
}

// ═══════════════════════════════════════════════════════════════
// Zbiorcza propozycja
// ═══════════════════════════════════════════════════════════════

/**
 * Jedna karta na cały przebieg, nie jedna na dokument.
 *
 * Pięć faktur kosztowych w nocy to pięć powiadomień o siódmej rano — czyli
 * dokładnie ten hałas, przez który ludzie wyłączają powiadomienia i przestają
 * widzieć również te ważne.
 */
export function buildInboxSummaryProposal(input: {
  tenantId: string;
  documents: readonly ClassifiedDocument[];
  periodKey: string;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const total = input.documents.length;
  if (total === 0) return null;

  const toDecide = input.documents.filter((d) => d.decision === 'needs_decision');
  const recognized = total - toDecide.length;
  const sum = input.documents.reduce((acc, d) => acc + d.grossAmount, 0);

  const title =
    toDecide.length > 0
      ? `${countLabel(total, 'nowy koszt', 'nowe koszty', 'nowych kosztów')} — ${countLabel(toDecide.length, 'jeden do decyzji', 'do decyzji', 'do decyzji')}`
      : `${countLabel(total, 'nowy koszt', 'nowe koszty', 'nowych kosztów')} ze skrzynki KSeF`;

  const body =
    toDecide.length > 0
      ? `Razem ${formatPlnPlain(sum)}. Rozpoznałem ${recognized}, przy reszcie nie zgaduję — zajrzyj na chwilę.`
      : `Razem ${formatPlnPlain(sum)}. Wszystko rozpoznane i przypisane do kolumn.`;

  return {
    tenantId: input.tenantId,
    kind: 'expense.review',
    // Jedna karta na okres pobierania — kolejny przebieg tego samego dnia
    // aktualizuje ją, zamiast dokładać drugą.
    topicKey: `expense.inbox:${input.periodKey}`,
    title,
    body,
    fingerprint: fingerprintOf({
      total,
      toDecide: toDecide.length,
      sum: Math.round(sum * 100),
    }),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    priority: toDecide.length > 0 ? 40 : 65,
    payload: {
      periodKey: input.periodKey,
      documentIds: input.documents.map((d) => d.id),
      needsDecisionIds: toDecide.map((d) => d.id),
    },
    evidence: [
      { label: 'Skrzynka odbiorcza', href: '/inbox' },
      { label: 'Wydatki', href: '/expenses' },
    ],
  };
}

/** Polska odmiana przez liczebnik — po stronie serwera, bo tu powstaje tekst. */
function countLabel(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `1 ${one}`;
  const last = n % 10;
  const lastTwo = n % 100;
  const isFew = last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${n} ${isFew ? few : many}`;
}

// ═══════════════════════════════════════════════════════════════
// Pary paragon–faktura
// ═══════════════════════════════════════════════════════════════

export interface PairCandidate {
  id: string;
  source: 'receipt' | 'ksef';
  sellerName: string | null;
  grossAmount: number;
  issueDate: string;
}

export interface DocumentPair {
  receiptId: string;
  invoiceId: string;
  sellerName: string;
  amount: number;
}

const PAIR_DAYS_TOLERANCE = 3;
const PAIR_AMOUNT_TOLERANCE = 0.01;

/**
 * Zestawia paragon z fakturą za ten sam zakup.
 *
 * NIE NAZYWAMY TEGO DUPLIKATEM i nie kasujemy niczego. Klient zrobił zdjęcie
 * paragonu, a potem sprzedawca przysłał fakturę — nie zrobił nic złego.
 * Wynik trafia wyłącznie do domknięcia miesiąca, jako jedna neutralna linijka
 * z pytaniem, czy zostawić oba dokumenty.
 */
export function pairReceiptsWithInvoices(
  documents: readonly PairCandidate[],
): DocumentPair[] {
  const receipts = documents.filter((d) => d.source === 'receipt');
  const invoices = documents.filter((d) => d.source === 'ksef');
  const used = new Set<string>();
  const pairs: DocumentPair[] = [];

  for (const receipt of receipts) {
    const match = invoices.find((invoice) => {
      if (used.has(invoice.id)) return false;
      if (!receipt.sellerName || !invoice.sellerName) return false;
      if (normalize(receipt.sellerName) !== normalize(invoice.sellerName)) {
        return false;
      }
      if (
        Math.abs(receipt.grossAmount - invoice.grossAmount) >
        PAIR_AMOUNT_TOLERANCE
      ) {
        return false;
      }
      return daysBetween(receipt.issueDate, invoice.issueDate) <= PAIR_DAYS_TOLERANCE;
    });

    if (match) {
      used.add(match.id);
      pairs.push({
        receiptId: receipt.id,
        invoiceId: match.id,
        sellerName: receipt.sellerName ?? '',
        amount: receipt.grossAmount,
      });
    }
  }

  return pairs;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
}

function daysBetween(a: string, b: string): number {
  const diff = Math.abs(Date.parse(a) - Date.parse(b));
  return Number.isNaN(diff) ? Number.POSITIVE_INFINITY : diff / 86_400_000;
}

// ═══════════════════════════════════════════════════════════════
// Ciągłość pobierania
// ═══════════════════════════════════════════════════════════════

export interface InboxCursorState {
  continuationToken: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  announcedCount: number;
  savedCount: number;
}

export type ContinuityVerdict =
  | { status: 'complete' }
  | { status: 'incomplete'; missing: number; message: string }
  | { status: 'resume'; token: string };

/**
 * Czy pobieranie doszło do końca — i co zrobić, jeśli nie.
 *
 * `resume` ma pierwszeństwo przed `incomplete`: skoro mamy token, nie ma po co
 * alarmować, wystarczy dokończyć. Alarm zostaje na sytuację, w której token
 * się skończył, a liczby się nie zgadzają — wtedy dokumenty naprawdę
 * przepadły i ktoś musi to zobaczyć.
 */
export function evaluateContinuity(state: InboxCursorState): ContinuityVerdict {
  if (state.continuationToken) {
    return { status: 'resume', token: state.continuationToken };
  }

  const missing = state.announcedCount - state.savedCount;
  if (missing > 0) {
    return {
      status: 'incomplete',
      missing,
      message: `KSeF zapowiedział ${state.announcedCount} dokumentów, zapisałem ${state.savedCount}. Brakuje ${missing}.`,
    };
  }

  return { status: 'complete' };
}

/** Czy zapisany kursor dotyczy tego samego okna dat. */
export function cursorMatchesWindow(
  state: InboxCursorState,
  from: Date,
  to: Date,
): boolean {
  if (!state.windowFrom || !state.windowTo) return false;
  return (
    state.windowFrom === from.toISOString() && state.windowTo === to.toISOString()
  );
}
