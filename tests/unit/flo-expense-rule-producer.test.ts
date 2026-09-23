import { describe, expect, it } from 'vitest';

import {
  collectSellerAmounts,
  LEARN_AFTER_OCCURRENCES,
  proposeRuleAfterReview,
  type ReviewedExpense,
  type RuleLearningSources,
  type SellerExpense,
} from '@/lib/flo/functions/expense-rules';

import { createFakeDb } from './flo-fake-db';

/**
 * W-03 — pytanie o regułę po potwierdzeniu kategorii (plan FLO 2, K1.8).
 *
 * Reguła księguje sama, cicho i przez wiele miesięcy, więc najważniejsze testy
 * w tym pliku dotyczą sytuacji, w których agent ma MILCZEĆ: sprzedawca
 * księgowany raz tak, raz inaczej, reguła już istniejąca i konto poza kanarkiem.
 */

const NOW = new Date('2026-09-23T10:00:00.000Z');
const TENANT = 'ten-1';
const EXPENSE = 'exp-2';

function alphaFlag(tenantId = TENANT) {
  return { tenant_id: tenantId, kind: 'expense.rule', enabled: true, reason: 'alfa W-03' };
}

function reviewed(overrides: Partial<ReviewedExpense> = {}): ReviewedExpense {
  return {
    sellerName: 'Adobe',
    sellerNip: null,
    kpirColumn: 'col_13',
    categoryLabel: 'oprogramowanie',
    ...overrides,
  };
}

function sources(overrides: Partial<RuleLearningSources> = {}) {
  const calls = { expense: 0, history: 0, rules: 0 };
  const value: RuleLearningSources = {
    readReviewedExpense: async () => {
      calls.expense++;
      return reviewed();
    },
    readSellerExpenses: async () => {
      calls.history++;
      return [
        { grossAmount: 100, kpirColumn: 'col_13' },
        { grossAmount: 120, kpirColumn: 'col_13' },
      ] satisfies SellerExpense[];
    },
    hasRuleFor: async () => {
      calls.rules++;
      return false;
    },
    readGlobalKill: async () => false,
    ...overrides,
  };
  return { value, calls };
}

// ═══════════════════════════════════════════════════════════════
// Funkcja czysta
// ═══════════════════════════════════════════════════════════════

describe('W-03 — kwoty i spójność historii sprzedawcy', () => {
  it('kwoty ze wszystkich dokumentów, także jeszcze nieprzejrzanych', () => {
    const { amounts, mixed } = collectSellerAmounts(
      [
        { grossAmount: 100, kpirColumn: 'col_13' },
        { grossAmount: 140, kpirColumn: null },
        { grossAmount: 0, kpirColumn: null },
      ],
      'col_13',
    );

    expect(amounts).toEqual([100, 140]);
    expect(mixed).toBe(false);
  });

  it('AWARIA: ten sam sprzedawca księgowany różnie to historia niespójna', () => {
    // Reguła z takiej historii zgadywałaby, które z dwóch księgowań jest tym
    // właściwym — i myliłaby się cicho, przez miesiące.
    const { mixed } = collectSellerAmounts(
      [
        { grossAmount: 100, kpirColumn: 'col_13' },
        { grossAmount: 120, kpirColumn: 'col_10' },
      ],
      'col_13',
    );

    expect(mixed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Producent
// ═══════════════════════════════════════════════════════════════

describe('W-03 — kiedy agent pyta o regułę', () => {
  it('drugi koszt tego sprzedawcy: pytanie z widełkami i dwiema odpowiedziami', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await proposeRuleAfterReview(
      TENANT,
      EXPENSE,
      NOW,
      db.client,
      sources().value,
    );

    expect(outcome).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(1);

    const row = db.tables.flo_proposals[0]!;
    expect(row.topic_key).toBe('expense.rule:Adobe');
    expect(row.title).toContain('Adobe');

    const payload = row.payload as Record<string, unknown>;
    // Widełki: 100/2,5 do 120×2,5 — zakup innej klasy i tak zapyta.
    expect(payload.minAmount).toBe(40);
    expect(payload.maxAmount).toBe(300);
    expect(payload.primaryLabel).toBe('Tak, zawsze tak księguj');
    expect(payload.secondary).toEqual([
      { label: 'Pytaj za każdym razem', intent: 'dismiss' },
    ]);
  });

  it('pierwszy koszt sprzedawcy: milczymy', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, {
      ...sources().value,
      readSellerExpenses: async () => [{ grossAmount: 100, kpirColumn: 'col_13' }],
    });

    expect(outcome).toBe('too_few');
    expect(LEARN_AFTER_OCCURRENCES).toBe(2);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('AWARIA: sprzedawca księgowany różnie — nie proponujemy reguły', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, {
      ...sources().value,
      readSellerExpenses: async () => [
        { grossAmount: 100, kpirColumn: 'col_13' },
        { grossAmount: 2000, kpirColumn: 'col_10' },
      ],
    });

    expect(outcome).toBe('mixed_history');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('reguła dla tego sprzedawcy już istnieje: nie pytamy i nie czytamy historii', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources({ hasRuleFor: async () => true });

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, src.value);

    expect(outcome).toBe('rule_exists');
    expect(src.calls.history).toBe(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('szuka reguły po NIP-ie ORAZ po nazwie', async () => {
    // Reguła mogła powstać, gdy sprzedawca nie miał jeszcze odczytanego NIP-u.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const asked: string[][] = [];

    await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, {
      ...sources().value,
      readReviewedExpense: async () => reviewed({ sellerNip: '1234567890' }),
      hasRuleFor: async (_tenantId, values) => {
        asked.push([...values]);
        return false;
      },
    });

    expect(asked[0]).toEqual(['1234567890', 'Adobe']);
    expect(db.tables.flo_proposals[0]!.topic_key).toBe('expense.rule:1234567890');
  });

  it('koszt bez kategorii: nie ma czego utrwalać', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, {
      ...sources().value,
      readReviewedExpense: async () => reviewed({ kpirColumn: '' }),
    });

    expect(outcome).toBe('no_category');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('koszt spoza konta: odmowa bez śladu', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, {
      ...sources().value,
      readReviewedExpense: async () => null,
    });

    expect(outcome).toBe('missing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });
});

describe('W-03 — bramki', () => {
  it('konto poza kanarkiem: kosztów nawet nie czytamy', async () => {
    // Tak wygląda dziś każde konto na produkcji: `flo_rollout` jest puste.
    const db = createFakeDb();
    const src = sources();

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, src.value);

    expect(outcome).toBe('disabled');
    expect(src.calls).toEqual({ expense: 0, history: 0, rules: 0 });
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('„nigdy więcej takich": cisza bez odczytu', async () => {
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_decisions: [
        {
          tenant_id: TENANT,
          kind: 'expense.rule',
          accepted: 0,
          dismissed: 2,
          muted_until: '2026-12-01T00:00:00.000Z',
        },
      ],
    });
    const src = sources();

    const outcome = await proposeRuleAfterReview(TENANT, EXPENSE, NOW, db.client, src.value);

    expect(outcome).toBe('disabled');
    expect(src.calls.expense).toBe(0);
  });
});
