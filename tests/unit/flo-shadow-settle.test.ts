import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/nextjs';

import { createProposal, type CreateProposalInput } from '@/lib/flo/proposals';
import { shadowSubject } from '@/lib/flo/shadow';
import {
  NO_INDEPENDENT_SIGNAL,
  runShadowSettle,
  SETTLE_AFTER_DAYS,
  type ExpenseReviewState,
  type SettleSources,
} from '@/lib/flo/shadow-settle';
import { createFakeDb } from './flo-fake-db';

/**
 * Druga połowa trybu cichego (plan FLO 2, K3.2): po tygodniu dopisujemy, co
 * klient zrobił naprawdę. Dwie granice, których pilnuje ten plik:
 * - rozstrzygamy tylko to, co widać niezależnie od karty,
 * - brak decyzji człowieka to „czeka”, nie „chybienie”.
 */

const TENANT = 'ten-1';
const NOW = new Date('2026-09-28T06:00:00.000Z');
const STARY = new Date(NOW.getTime() - (SETTLE_AFTER_DAYS + 1) * 86_400_000).toISOString();
const SWIEZY = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();

function wpisW01(id: string, expenseId: string, expected: string | null, createdAt = STARY) {
  return {
    id,
    tenant_id: TENANT,
    kind: 'expense.review',
    created_at: createdAt,
    matched: null,
    actual: null,
    proposal: {
      topicKey: `expense.review:${expenseId}`,
      fingerprint: 'odcisk',
      ...(expected ? { entityId: expenseId, expected: { kpirColumn: expected } } : {}),
    },
  };
}

function zrodla(koszty: Record<string, ExpenseReviewState>): SettleSources {
  return { readExpense: async (_tenant, id) => koszty[id] ?? null };
}

beforeEach(() => vi.clearAllMocks());

describe('W-01 — kategoria kosztu', () => {
  it('przejrzany z tą samą kolumną: trafienie', async () => {
    const db = createFakeDb({ flo_shadow: [wpisW01('s1', 'exp-1', 'col_13')] });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: zrodla({ 'exp-1': { kpirColumn: 'col_13', isReviewed: true } }),
    });

    expect(wynik).toMatchObject({ settled: 1, matched: 1 });
    expect(db.tables.flo_shadow[0]).toMatchObject({
      matched: true,
      actual: { didIt: true, entityId: 'exp-1' },
    });
  });

  it('przejrzany, ale człowiek zmienił kolumnę: chybienie', async () => {
    const db = createFakeDb({ flo_shadow: [wpisW01('s1', 'exp-1', 'col_13')] });
    await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: zrodla({ 'exp-1': { kpirColumn: 'col_10', isReviewed: true } }),
    });

    expect(db.tables.flo_shadow[0]!.matched).toBe(false);
  });

  it('nieprzejrzany: czeka — brak decyzji człowieka to nie chybienie', async () => {
    const db = createFakeDb({ flo_shadow: [wpisW01('s1', 'exp-1', 'col_13')] });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: zrodla({ 'exp-1': { kpirColumn: 'col_13', isReviewed: false } }),
    });

    expect(wynik).toMatchObject({ settled: 0, stillOpen: 1 });
    expect(db.tables.flo_shadow[0]!.matched).toBeNull();
  });

  it('koszt usunięty albo wpis sprzed zapisu przewidywania: czeka', async () => {
    const db = createFakeDb({
      flo_shadow: [wpisW01('s1', 'exp-usuniety', 'col_13'), wpisW01('s2', 'exp-2', null)],
    });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: zrodla({ 'exp-2': { kpirColumn: 'col_13', isReviewed: true } }),
    });

    expect(wynik).toMatchObject({ settled: 0, stillOpen: 2 });
  });
});

describe('granice przebiegu', () => {
  it('wpisy młodsze niż tydzień nie są ruszane', async () => {
    const db = createFakeDb({ flo_shadow: [wpisW01('s1', 'exp-1', 'col_13', SWIEZY)] });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: zrodla({ 'exp-1': { kpirColumn: 'col_13', isReviewed: true } }),
    });

    expect(wynik).toEqual({ settled: 0, matched: 0, stillOpen: 0, noDefinition: 0, failed: 0 });
    expect(db.tables.flo_shadow[0]!.matched).toBeNull();
  });

  it('K-01 i K-02 nie mają niezależnego sygnału — zostają nierozstrzygnięte z powodem', async () => {
    const k01 = { ...wpisW01('s1', 'x', null), kind: 'payment.confirm', proposal: { topicKey: 'payment.confirm:inv-1', fingerprint: 'o' } };
    const db = createFakeDb({ flo_shadow: [k01] });
    const wynik = await runShadowSettle({ now: NOW, db: db.client, sources: zrodla({}) });

    expect(wynik.noDefinition).toBe(1);
    expect(db.tables.flo_shadow[0]!.matched).toBeNull();
    expect(Object.keys(NO_INDEPENDENT_SIGNAL).sort()).toEqual(['payment.chase', 'payment.confirm']);
  });

  it('błąd jednego wpisu nie zatrzymuje reszty i idzie do Sentry', async () => {
    const db = createFakeDb({
      flo_shadow: [wpisW01('s1', 'exp-zly', 'col_13'), wpisW01('s2', 'exp-2', 'col_13')],
    });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: {
        readExpense: async (_t, id) => {
          if (id === 'exp-zly') throw new Error('timeout');
          return { kpirColumn: 'col_13', isReviewed: true };
        },
      },
    });

    expect(wynik).toMatchObject({ settled: 1, failed: 1 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('czyta stronami do końca — rozstrzygnięte wiersze nie przesuwają okna', async () => {
    const wpisy = Array.from({ length: 1203 }, (_, i) =>
      wpisW01(`s${String(i).padStart(5, '0')}`, `exp-${i}`, 'col_13'),
    );
    const db = createFakeDb({ flo_shadow: wpisy });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: { readExpense: async () => ({ kpirColumn: 'col_13', isReviewed: true }) },
    });

    expect(wynik.settled).toBe(1203);
    expect(db.tables.flo_shadow.every((w) => w.matched === true)).toBe(true);
  });
});

describe('przebieg się kończy', () => {
  it('ponad stronę wpisów, które zostają otwarte, nie zapętla przebiegu', async () => {
    // Otwarte wpisy NIE wypadają z filtra `matched IS NULL` — bez stronicowania
    // po id przebieg czytałby w kółko tę samą pierwszą stronę.
    const wpisy = Array.from({ length: 1100 }, (_, i) =>
      wpisW01(`s${String(i).padStart(5, '0')}`, `exp-${i}`, 'col_13'),
    );
    const db = createFakeDb({ flo_shadow: wpisy });
    const wynik = await runShadowSettle({
      now: NOW,
      db: db.client,
      sources: { readExpense: async () => ({ kpirColumn: 'col_13', isReviewed: false }) },
    });

    expect(wynik.stillOpen).toBe(1100);
  }, 10_000);
});

describe('zapis przewidywania w trybie cichym', () => {
  it('W-01 zapisuje koszt i przewidzianą kolumnę — nic więcej', () => {
    expect(
      shadowSubject({
        kind: 'expense.review',
        payload: { expenseId: 'exp-1', facts: { kpirColumn: 'col_13', grossTotal: 123 }, issues: ['x'] },
      }),
    ).toEqual({ entityId: 'exp-1', expected: { kpirColumn: 'col_13' } });
  });

  it('rodzaj bez definicji trafienia nie zapisuje niczego „na zapas” (np. dane kontrahenta)', () => {
    expect(
      shadowSubject({ kind: 'payment.confirm', payload: { invoiceId: 'inv-1', contractorName: 'Nowak' } }),
    ).toEqual({});
  });

  it('createProposal w trybie cichym zapisuje przewidywanie W-01 do flo_shadow', async () => {
    const db = createFakeDb({});
    const input: CreateProposalInput = {
      tenantId: TENANT,
      kind: 'expense.review',
      topicKey: 'expense.review:exp-1',
      title: 'Koszt',
      body: 'Przypisałem kolumnę',
      fingerprint: 'odcisk',
      expiresAt: new Date('2026-10-28T00:00:00.000Z'),
      payload: { expenseId: 'exp-1', facts: { kpirColumn: 'col_13' } },
    };
    const wynik = await createProposal(input, db.client, async () => false);

    expect(wynik.status).toBe('disabled');
    expect(db.tables.flo_shadow[0]?.proposal).toEqual({
      topicKey: 'expense.review:exp-1',
      fingerprint: 'odcisk',
      entityId: 'exp-1',
      expected: { kpirColumn: 'col_13' },
    });
  });
});
