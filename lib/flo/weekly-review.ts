/**
 * Przegląd tygodniowy agenta (krok 56 planu).
 *
 * Sześć wskaźników w jednym miejscu i JEDNO ZDANIE WERDYKTU per funkcja:
 * zostaje, wraca do poprawki, czy czeka na próbkę.
 *
 * PO CO OSOBNY MODUŁ, SKORO LICZBY SĄ W `metrics.ts` I `shadow.ts`:
 * przegląd bez werdyktu zamienia się w tabelkę, na którą się patrzy
 * i nic z niej nie wynika. Funkcja poniżej progu ma WRACAĆ DO POPRAWKI,
 * a nie „być obserwowana” — i to musi paść w wyniku, nie w czyjejś głowie.
 */

import { computeRates, type ProposalCounts } from '@/lib/flo/metrics';
import {
  isReadyToReveal,
  KIND_RADIUS,
  RADIUS_THRESHOLDS,
  type AccuracyStats,
} from '@/lib/flo/shadow';
import type { FloProposalKind } from '@/types/flo';

/** Powyżej tego odsetka cofnięć funkcja wraca do poprawki niezależnie od reszty. */
export const UNDO_ALARM_PCT = 15;

/** Minimalna liczba przyjętych propozycji, żeby odsetek cofnięć coś znaczył. */
export const UNDO_MIN_SAMPLE = 20;

export type ReviewVerdict =
  /** Działa, zostaje. */
  | 'keep'
  /** Za mało danych, żeby cokolwiek orzec. */
  | 'wait'
  /** Poniżej progu — wraca do poprawki. */
  | 'fix'
  /** Wstrzymana zgłoszeniem klienta. */
  | 'halted';

export interface FunctionReview {
  kind: FloProposalKind | string;
  radius: number;
  verdict: ReviewVerdict;
  /** Jedno zdanie: dlaczego taki werdykt. */
  reason: string;
  counts: ProposalCounts;
  acceptedPct: number;
  ignoredPct: number;
  undonePct: number;
  accuracy: number | null;
}

export interface ReviewInput {
  kind: FloProposalKind;
  counts: ProposalCounts;
  /** Wynik trybu cichego; `null` = funkcja nigdy nie była w trybie cichym. */
  shadow: AccuracyStats | null;
  /** Czy wdrożenie zostało wstrzymane zgłoszeniem. */
  halted: boolean;
  haltReason?: string | null;
}

/**
 * Werdykt dla jednej funkcji — funkcja czysta.
 *
 * Kolejność sprawdzeń jest treścią: zgłoszenie klienta bije wszystkie
 * liczby. Funkcja z doskonałą trafnością i jedną reklamacją jest funkcją
 * do poprawki, bo trafność mierzy średnią, a reklamacja mierzy człowieka,
 * któremu coś zepsuliśmy.
 */
export function reviewFunction(input: ReviewInput): FunctionReview {
  const rates = computeRates(input.counts);
  const radius = KIND_RADIUS[input.kind];

  const base = {
    kind: input.kind,
    radius,
    counts: input.counts,
    acceptedPct: rates.acceptedPct,
    ignoredPct: rates.ignoredPct,
    undonePct: rates.undonePct,
    accuracy: input.shadow?.accuracy ?? null,
  };

  if (input.halted) {
    return {
      ...base,
      verdict: 'halted',
      reason: input.haltReason ?? 'Wdrożenie wstrzymane zgłoszeniem klienta.',
    };
  }

  // Cofnięcia bijemy przed trafnością: cofnięcie to człowiek mówiący
  // „nie o to mi chodziło" o KONKRETNEJ sprawie, a trafność jest średnią.
  if (
    input.counts.accepted >= UNDO_MIN_SAMPLE &&
    rates.undonePct > UNDO_ALARM_PCT
  ) {
    return {
      ...base,
      verdict: 'fix',
      reason: `${rates.undonePct}% przyjętych zostało cofniętych — agent robi coś, czego ludzie po namyśle nie chcą.`,
    };
  }

  if (input.shadow) {
    const readiness = isReadyToReveal(input.shadow);
    if (!readiness.ready) {
      return {
        ...base,
        verdict: readiness.reason === 'sample_too_small' ? 'wait' : 'fix',
        reason: readiness.detail,
      };
    }
  }

  if (input.counts.total < RADIUS_THRESHOLDS[radius].minSample / 10) {
    return {
      ...base,
      verdict: 'wait',
      reason: `${input.counts.total} propozycji — za mało, żeby cokolwiek orzec.`,
    };
  }

  // Funkcja, którą wszyscy ignorują, nie jest funkcją działającą. Nie jest
  // też awarią — jest funkcją, której nikt nie potrzebuje, i to też jest
  // wynik przeglądu.
  if (rates.ignoredPct > 70) {
    return {
      ...base,
      verdict: 'fix',
      reason: `${rates.ignoredPct}% kart wygasa bez decyzji — albo nie trafia w moment, albo nie jest potrzebna.`,
    };
  }

  return {
    ...base,
    verdict: 'keep',
    reason: `${rates.acceptedPct}% przyjętych, ${rates.undonePct}% cofnięć.`,
  };
}

export interface WeeklyReview {
  reviews: FunctionReview[];
  /** Funkcje wymagające decyzji człowieka w tym tygodniu. */
  needsAttention: FunctionReview[];
  summary: string;
}

/**
 * Cały przegląd — funkcje do poprawki na górze.
 *
 * Kolejność nie jest kosmetyczna: przegląd czyta się w piątek po południu
 * i to, co jest pierwsze, jest jedyną rzeczą, która na pewno zostanie
 * przeczytana.
 */
export function buildWeeklyReview(inputs: readonly ReviewInput[]): WeeklyReview {
  const order: Record<ReviewVerdict, number> = { halted: 0, fix: 1, wait: 2, keep: 3 };
  const reviews = inputs
    .map(reviewFunction)
    .sort((a, b) => order[a.verdict] - order[b.verdict]);

  const needsAttention = reviews.filter(
    (review) => review.verdict === 'fix' || review.verdict === 'halted',
  );

  return {
    reviews,
    needsAttention,
    summary:
      needsAttention.length === 0
        ? `${reviews.length} funkcji, żadna nie wymaga poprawki.`
        : `${needsAttention.length} z ${reviews.length} funkcji wraca do poprawki: ${needsAttention
            .map((review) => review.kind)
            .join(', ')}.`,
  };
}
