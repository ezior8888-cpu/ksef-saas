import { describe, expect, it } from 'vitest';

import type { ProposalCounts } from '@/lib/flo/metrics';
import type { AccuracyStats } from '@/lib/flo/shadow';
import {
  buildWeeklyReview,
  reviewFunction,
  UNDO_ALARM_PCT,
  UNDO_MIN_SAMPLE,
  type ReviewInput,
} from '@/lib/flo/weekly-review';

/**
 * Przegląd tygodniowy (krok 56).
 *
 * Sens tego modułu: funkcja poniżej progu ma WRACAĆ DO POPRAWKI, a nie
 * „być obserwowana”.
 */

function counts(overrides: Partial<ProposalCounts> = {}): ProposalCounts {
  return {
    total: 100,
    accepted: 60,
    dismissed: 20,
    expired: 20,
    blocked: 0,
    undone: 2,
    staleBlocked: 0,
    ...overrides,
  };
}

function shadow(overrides: Partial<AccuracyStats> = {}): AccuracyStats {
  return {
    kind: 'expense.review',
    radius: 2,
    settled: 300,
    matched: 285,
    accuracy: 95,
    pending: 0,
    ...overrides,
  };
}

function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    kind: 'expense.review',
    counts: counts(),
    shadow: shadow(),
    halted: false,
    ...overrides,
  };
}

describe('werdykt per funkcja', () => {
  it('funkcja, która działa, zostaje', () => {
    const review = reviewFunction(input());
    expect(review.verdict).toBe('keep');
    expect(review.reason).toContain('60% przyjętych');
  });

  it('ZGŁOSZENIE KLIENTA BIJE WSZYSTKIE LICZBY', () => {
    // Funkcja z doskonałą trafnością i jedną reklamacją jest funkcją do
    // poprawki: trafność mierzy średnią, a reklamacja mierzy człowieka,
    // któremu coś zepsuliśmy.
    const review = reviewFunction(
      input({
        halted: true,
        haltReason: 'ponaglenie do zapłaconej faktury',
        shadow: shadow({ accuracy: 100, matched: 300 }),
      }),
    );
    expect(review.verdict).toBe('halted');
    expect(review.reason).toContain('ponaglenie');
  });

  it('wysoki odsetek cofnięć wysyła funkcję do poprawki', () => {
    const review = reviewFunction(
      input({ counts: counts({ accepted: 60, undone: 15 }) }),
    );
    expect(review.verdict).toBe('fix');
    expect(review.reason).toContain('cofniętych');
    expect(25).toBeGreaterThan(UNDO_ALARM_PCT);
  });

  it('cofnięcia przy małej próbce nie alarmują', () => {
    // Dwa cofnięcia z pięciu przyjętych to nie sygnał, tylko szum.
    const review = reviewFunction(
      input({ counts: counts({ total: 10, accepted: 5, expired: 3, undone: 2 }) }),
    );
    expect(review.verdict).not.toBe('fix');
    expect(UNDO_MIN_SAMPLE).toBe(20);
  });

  it('trafność poniżej progu wysyła do poprawki', () => {
    const review = reviewFunction(
      input({ shadow: shadow({ matched: 240, accuracy: 80 }) }),
    );
    expect(review.verdict).toBe('fix');
    expect(review.reason).toContain('90%');
  });

  it('za mała próbka to CZEKANIE, nie poprawka', () => {
    const review = reviewFunction(
      input({ shadow: shadow({ settled: 20, matched: 20, accuracy: 100 }) }),
    );
    expect(review.verdict).toBe('wait');
  });

  it('funkcja, którą wszyscy ignorują, też wraca do poprawki', () => {
    // Nie jest awarią — jest funkcją, której nikt nie potrzebuje,
    // i to też jest wynik przeglądu.
    const review = reviewFunction(
      input({ counts: counts({ total: 100, accepted: 10, dismissed: 5, expired: 85 }) }),
    );
    expect(review.verdict).toBe('fix');
    expect(review.reason).toContain('wygasa bez decyzji');
  });

  it('funkcja bez trybu cichego też dostaje werdykt', () => {
    expect(reviewFunction(input({ shadow: null })).verdict).toBe('keep');
  });
});

describe('cały przegląd', () => {
  const review = buildWeeklyReview([
    input({ kind: 'expense.review' }),
    input({
      kind: 'payment.chase',
      halted: true,
      haltReason: 'zgłoszenie: ponaglenie do zapłaconej faktury',
    }),
    input({ kind: 'ksef.cert', shadow: shadow({ settled: 5, matched: 5, accuracy: 100 }) }),
    input({ kind: 'invoice.batch', counts: counts({ accepted: 60, undone: 20 }) }),
  ]);

  it('do poprawki na górze — to jedyne, co na pewno zostanie przeczytane', () => {
    expect(review.reviews[0]?.verdict).toBe('halted');
    expect(review.reviews[1]?.verdict).toBe('fix');
    expect(review.reviews[review.reviews.length - 1]?.verdict).toBe('keep');
  });

  it('lista wymagających decyzji obejmuje wstrzymane i do poprawki', () => {
    expect(review.needsAttention.map((r) => r.kind).sort()).toEqual([
      'invoice.batch',
      'payment.chase',
    ]);
  });

  it('podsumowanie mówi wprost, ile wraca do poprawki', () => {
    expect(review.summary).toContain('2 z 4 funkcji wraca do poprawki');
  });

  it('spokojny tydzień ma spokojne podsumowanie', () => {
    const calm = buildWeeklyReview([input(), input({ kind: 'ksef.outage' })]);
    expect(calm.needsAttention).toHaveLength(0);
    expect(calm.summary).toContain('żadna nie wymaga poprawki');
  });

  it('każdy wiersz niesie komplet sześciu wskaźników', () => {
    for (const row of review.reviews) {
      expect(row.counts.total).toBeGreaterThan(0);
      expect(typeof row.acceptedPct).toBe('number');
      expect(typeof row.ignoredPct).toBe('number');
      expect(typeof row.undonePct).toBe('number');
      expect(row.reason.length).toBeGreaterThan(10);
    }
  });
});
