/**
 * W-01 — paragon prosto z telefonu (krok 18 planu).
 *
 * Klient robi zdjęcie i o nim zapomina. Po dwudziestu sekundach dostaje
 * kartę: „Orlen, 312,40 zł — paliwo. Zaksięgowałem.” Cała robota po jego
 * stronie to jedno zdjęcie.
 *
 * TRZY AWARIE, KTÓRE TU ZAMYKAMY (część II.10 planu):
 *
 * 1. ZŁY ODCZYT. Wyblakły paragon termiczny, zdjęcie pod kątem, „312,40”
 *    odczytane jako „31 240”. Trzy niezależne sita: brak wymaganego pola,
 *    kontrola arytmetyczna i kontrola rzędu wielkości wobec historii u tego
 *    sprzedawcy. Każde z nich zamienia meldunek w pytanie.
 *
 * 2. WYDATEK PRYWATNY. O firmowości decyduje wyłącznie człowiek. Nieznany
 *    sprzedawca przy większej kwocie i kategorie z natury wątpliwe zawsze
 *    kończą się pytaniem — nawet gdy odczyt jest idealny.
 *
 * 3. ZAWIESZONE ZADANIE. Odczyt, który nie skończył się w trzy minuty, sam
 *    zamienia się w kartę z drogą wyjścia. Zdjęcie zostaje w archiwum
 *    niezależnie od wyniku, więc dokument nigdy nie ginie.
 */

import { formatPlnPlain } from '@/lib/flo/money';
import { renderCopyVariant } from '@/lib/flo/copy';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { registerFloHandler } from '@/lib/flo/handlers';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { captureUndo } from '@/lib/flo/undo';
import { createAdminClient } from '@/lib/supabase/admin';

// ═══════════════════════════════════════════════════════════════
// Progi
// ═══════════════════════════════════════════════════════════════

/**
 * Poniżej tej pewności odczytu agent nie twierdzi, że wie, co przeczytał.
 * Schemat OCR zwraca `null` dla pól nieczytelnych, więc ta wartość dotyczy
 * odczytu jako całości.
 */
const CONFIDENCE_MIN = 0.7;

/** Tolerancja arytmetyczna: dwa grosze na zaokrągleniach po obu stronach. */
const ARITHMETIC_TOLERANCE = 0.02;

/** Ile razy kwota może odbiegać od typowej u tego sprzedawcy, zanim zapytamy. */
const MAGNITUDE_FACTOR = 5;

/** Ile dokumentów potrzeba, żeby mediana u sprzedawcy cokolwiek znaczyła. */
const HISTORY_MIN = 3;

/**
 * Kwota, powyżej której nieznany sprzedawca zawsze kończy się pytaniem.
 * Poniżej — drobne zakupy, przy których pytanie o każdy byłoby udręką.
 */
const UNKNOWN_SELLER_LIMIT_PLN = 500;

/** Po tylu minutach odczyt uznajemy za porzucony. */
export const OCR_STUCK_AFTER_MS = 3 * 60_000;

/**
 * Kategorie, w których pytamy ZAWSZE, niezależnie od reguł i pewności.
 * Nie dlatego, że OCR sobie nie radzi — dlatego, że to są zakupy, przy
 * których granica między firmowym a prywatnym jest cienka, a konsekwencje
 * pomyłki ponosi wyłącznie klient.
 */
const ALWAYS_ASK_CATEGORIES = new Set(['spozywcze', 'odziez', 'elektronika']);

// ═══════════════════════════════════════════════════════════════
// Ocena odczytu — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export interface OcrFacts {
  sellerName: string | null;
  sellerNip: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  grossAmount: number | null;
  issueDate: string | null;
  confidence: number | null;
  categoryLabel: string | null;
}

export interface SellerHistory {
  /** Ile dokumentów tego sprzedawcy klient już zaksięgował. */
  count: number;
  /** Mediana kwoty brutto — mediana, nie średnia: jeden wybryk nie psuje. */
  medianGross: number;
}

export type ExpenseIssue =
  | 'low_confidence'
  | 'missing_field'
  | 'arithmetic'
  | 'magnitude'
  | 'unknown_seller'
  | 'sensitive_category';

export interface ExpenseAssessment {
  issues: ExpenseIssue[];
  /** true = agent pyta zamiast meldować. */
  needsQuestion: boolean;
  /** Zdanie dla człowieka: dlaczego pytam. */
  reason: string;
}

const ISSUE_REASON: Record<ExpenseIssue, string> = {
  low_confidence: 'Zdjęcie jest słabo czytelne, więc nie ufam swojemu odczytowi.',
  missing_field: 'Nie odczytałem wszystkiego, czego potrzebuję.',
  arithmetic: 'Kwoty na paragonie mi się nie sumują.',
  magnitude: 'Ta kwota mocno odbiega od tego, co zwykle płacisz u tego sprzedawcy.',
  unknown_seller: 'Pierwszy raz widzę tego sprzedawcę, a kwota jest niemała.',
  sensitive_category: 'Przy takich zakupach nie zgaduję, czy to firmowy wydatek.',
};

export function assessExpense(
  facts: OcrFacts,
  history: SellerHistory,
): ExpenseAssessment {
  const issues: ExpenseIssue[] = [];

  if (!facts.sellerName || facts.grossAmount === null || !facts.issueDate) {
    issues.push('missing_field');
  }

  if (facts.confidence !== null && facts.confidence < CONFIDENCE_MIN) {
    issues.push('low_confidence');
  }

  // Kontrola arytmetyczna. Odczyt, w którym netto plus VAT nie daje brutto,
  // jest wewnętrznie sprzeczny — jedna z tych liczb jest przekłamana i nie
  // wiadomo która.
  if (
    facts.netAmount !== null &&
    facts.vatAmount !== null &&
    facts.grossAmount !== null &&
    Math.abs(facts.netAmount + facts.vatAmount - facts.grossAmount) >
      ARITHMETIC_TOLERANCE
  ) {
    issues.push('arithmetic');
  }

  // Kontrola rzędu wielkości. To jest sito na klasyczny błąd OCR: przecinek
  // odczytany jako nic, przez co 312,40 zamienia się w 31 240.
  if (
    facts.grossAmount !== null &&
    history.count >= HISTORY_MIN &&
    history.medianGross > 0
  ) {
    const ratio = facts.grossAmount / history.medianGross;
    if (ratio > MAGNITUDE_FACTOR || ratio < 1 / MAGNITUDE_FACTOR) {
      issues.push('magnitude');
    }
  }

  if (
    history.count === 0 &&
    facts.grossAmount !== null &&
    facts.grossAmount > UNKNOWN_SELLER_LIMIT_PLN
  ) {
    issues.push('unknown_seller');
  }

  if (facts.categoryLabel && ALWAYS_ASK_CATEGORIES.has(facts.categoryLabel)) {
    issues.push('sensitive_category');
  }

  return {
    issues,
    needsQuestion: issues.length > 0,
    reason: issues.length > 0 ? ISSUE_REASON[issues[0]!] : '',
  };
}

// ═══════════════════════════════════════════════════════════════
// Budowa propozycji — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export interface BuildExpenseProposalInput {
  tenantId: string;
  expenseId: string;
  facts: OcrFacts;
  history: SellerHistory;
  /** Co agent ustawił sam — potrzebne do cofnięcia. */
  applied: { kpirColumn: string | null; categoryLabel: string | null };
  now?: Date;
}

export function buildExpenseReviewProposal(
  input: BuildExpenseProposalInput,
): CreateProposalInput {
  const now = input.now ?? new Date();
  const assessment = assessExpense(input.facts, input.history);

  const seller = input.facts.sellerName ?? 'Nieznany sprzedawca';
  const amount = formatPlnPlain(input.facts.grossAmount ?? 0);
  const category = input.applied.categoryLabel ?? 'do decyzji';

  const copy = assessment.needsQuestion
    ? renderCopyVariant('expense.review', 'ask', {
        sprzedawca: seller,
        kwota: amount,
        powod: assessment.reason,
      })
    : renderCopyVariant('expense.review', 'done', {
        sprzedawca: seller,
        kwota: amount,
        kategoria: category,
      });

  const facts = {
    grossTotal: input.facts.grossAmount ?? 0,
    kpirColumn: input.applied.kpirColumn,
    reviewedAt: 0,
    deductible: 1,
  };

  return {
    tenantId: input.tenantId,
    kind: 'expense.review',
    // Jeden koszt = jedna karta, niezależnie od tego, ile razy przeliczymy.
    topicKey: `expense.review:${input.expenseId}`,
    title: copy.title,
    body: copy.body,
    fingerprint: fingerprintOf(facts),
    // Koszt nie przeterminowuje się szybko — klient ma prawo przejrzeć to
    // po powrocie z urlopu.
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    priority: assessment.needsQuestion ? 40 : 60,
    payload: {
      expenseId: input.expenseId,
      facts,
      issues: assessment.issues,
      // Kategoryzacja to czynność odwracalna wewnątrz konta — więc ma
      // cofnięcie. Bez tego „odwracalne” byłoby deklaracją, nie własnością.
      undo: assessment.needsQuestion
        ? undefined
        : captureUndo(
            'expenses',
            input.expenseId,
            { kpir_column: null, is_reviewed: false },
            {
              kpir_column: input.applied.kpirColumn,
              is_reviewed: false,
            },
            now,
          ),
    },
    evidence: [
      { label: 'Wydatek', href: `/expenses/${input.expenseId}` },
      { label: 'Wszystkie koszty', href: '/expenses' },
    ],
  };
}

/** Karta po nieudanym odczycie — zawsze z drogą wyjścia, nigdy bez. */
export function buildOcrFailedProposal(
  tenantId: string,
  ocrJobId: string,
  now: Date = new Date(),
): CreateProposalInput {
  const copy = renderCopyVariant('expense.review', 'failed', {});

  return {
    tenantId,
    kind: 'expense.review',
    topicKey: `expense.review:ocr:${ocrJobId}`,
    title: copy.title,
    body: copy.body,
    fingerprint: fingerprintOf({ ocrJobId }),
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    priority: 45,
    payload: { ocrJobId, failed: 1 },
    evidence: [{ label: 'Wydatki', href: '/expenses' }],
  };
}

// ═══════════════════════════════════════════════════════════════
// Odczyt historii sprzedawcy
// ═══════════════════════════════════════════════════════════════

interface ExpensesRows {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}

interface ExpensesClient {
  from: (table: 'expenses' | 'ocr_jobs') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (column: string, value: string) => Promise<ExpensesRows>;
      };
      in: (
        column: string,
        values: readonly string[],
      ) => {
        lt: (column: string, value: string) => Promise<ExpensesRows>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

export async function readSellerHistory(
  tenantId: string,
  sellerName: string | null,
  client: ExpensesClient = createAdminClient() as unknown as ExpensesClient,
): Promise<SellerHistory> {
  if (!sellerName) return { count: 0, medianGross: 0 };

  const { data, error } = await client
    .from('expenses')
    .select('gross_amount')
    .eq('tenant_id', tenantId)
    .eq('seller_name', sellerName);

  if (error) throw new Error(error.message);

  const amounts = (data ?? [])
    .map((row) => Number(row.gross_amount ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  return { count: amounts.length, medianGross: median(amounts) };
}

export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// ═══════════════════════════════════════════════════════════════
// Wykonawca
// ═══════════════════════════════════════════════════════════════

/**
 * „Zgadza się” — klient potwierdza to, co agent przypisał.
 *
 * Czynność wewnętrzna i odwracalna, więc nie wymaga niczego poza żetonem,
 * który wykonawca sprawdził przed wywołaniem tego kodu.
 */
registerFloHandler('expense.review', async (ctx) => {
  const expenseId = ctx.proposal.payload?.expenseId;
  if (typeof expenseId !== 'string') {
    throw new Error('Propozycja bez identyfikatora wydatku');
  }

  const client = createAdminClient() as unknown as ExpensesClient;
  const { error } = await client
    .from('expenses')
    .update({ is_reviewed: true })
    .eq('id', expenseId);

  if (error) throw new Error(error.message);

  return { summary: 'koszt potwierdzony przez klienta', details: { expenseId } };
});

// ═══════════════════════════════════════════════════════════════
// Strażnik zawieszonych odczytów
// ═══════════════════════════════════════════════════════════════

/**
 * Zamienia porzucone zadania OCR w karty z drogą wyjścia.
 *
 * DLACZEGO NIE OZNACZAMY ZADANIA JAKO NIEUDANEGO: tak samo jak istniejący
 * strażnik zadań, nie mutujemy cudzego stanu. Zadanie mogło być tylko wolne,
 * a przedwczesne oznaczenie go jako błąd zatruwa kolejkę. Tworzymy kartę;
 * jeśli odczyt jednak dojdzie, karta zostanie zastąpiona meldunkiem o wyniku
 * (ten sam klucz tematu).
 *
 * WOŁANE Z DWÓCH MIEJSC: z pulsu agenta (raz dziennie, jako siatka
 * bezpieczeństwa) i ze strażnika zadań co piętnaście minut, bo to on ma
 * właściwą częstotliwość. Podwójne wywołanie jest nieszkodliwe — klucz
 * tematu gwarantuje jedną kartę na jedno zadanie.
 */
export async function findStuckOcrJobs(
  tenantScopedNow: Date,
  client: ExpensesClient = createAdminClient() as unknown as ExpensesClient,
): Promise<Array<{ id: string; tenantId: string }>> {
  const cutoff = new Date(
    tenantScopedNow.getTime() - OCR_STUCK_AFTER_MS,
  ).toISOString();

  const { data, error } = await client
    .from('ocr_jobs')
    .select('id, tenant_id, status, created_at')
    .in('status', ['pending', 'processing'])
    .lt('created_at', cutoff);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
  }));
}
