import { describe, expect, it } from 'vitest';

import {
  buildPanelRows,
  computeCost,
  computeRates,
  COST_HARD_LIMIT_PLN,
  COST_TARGET_PLN,
  countBlockedByRevalidation,
  countProposals,
  readCostMetrics,
  readProposalMetrics,
} from '@/lib/flo/metrics';
import {
  accuracyByKind,
  isReadyToReveal,
  KIND_RADIUS,
  matchesActual,
  RADIUS_THRESHOLDS,
  recordShadow,
  settleShadow,
  summarizeShadow,
  type AccuracyStats,
} from '@/lib/flo/shadow';
import { FLO_PROPOSAL_KINDS } from '@/types/flo';
import { createFakeDb } from './flo-fake-db';

/**
 * M7 — tryb cichy i metryki (krok 52).
 *
 * Definicja gotowości: panel pokazuje liczby dla wszystkich zbudowanych
 * funkcji.
 */

// ═══════════════════════════════════════════════════════════════
// Promienie i progi z części II.8
// ═══════════════════════════════════════════════════════════════

describe('progi trafności', () => {
  it('KAŻDY rodzaj propozycji ma przypisany promień', () => {
    // Rodzaj bez promienia nie miałby progu, czyli wyszedłby z ukrycia
    // bez żadnego warunku.
    for (const kind of FLO_PROPOSAL_KINDS) {
      expect(KIND_RADIUS[kind], kind).toBeGreaterThanOrEqual(1);
      expect(KIND_RADIUS[kind], kind).toBeLessThanOrEqual(4);
    }
  });

  it('progi zgodne z planem', () => {
    expect(RADIUS_THRESHOLDS[4]).toEqual({
      accuracy: 95,
      minSample: 200,
      oneErrorBlocks: false,
    });
    expect(RADIUS_THRESHOLDS[2]).toEqual({
      accuracy: 90,
      minSample: 300,
      oneErrorBlocks: false,
    });
    expect(RADIUS_THRESHOLDS[1]).toEqual({
      accuracy: 75,
      minSample: 100,
      oneErrorBlocks: false,
    });
  });

  it('rodzaj obsługujący kilka funkcji dostaje WYŻSZY promień', () => {
    // `invoice.draft` niesie P-03 (promień 1) i pojedynczy szkic z P-02
    // (promień 4). Przy sporze wygrywa surowszy próg.
    expect(KIND_RADIUS['invoice.draft']).toBe(4);
  });

  it('funkcje wychodzące na zewnątrz mają promień 4', () => {
    for (const kind of ['payment.chase', 'invoice.raise', 'accountant.package'] as const) {
      expect(KIND_RADIUS[kind], kind).toBe(4);
    }
  });

  it('grupa podatkowa ma promień 3', () => {
    for (const kind of ['tax.deadline', 'tax.limit', 'tax.setaside'] as const) {
      expect(KIND_RADIUS[kind], kind).toBe(3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Kiedy funkcja wychodzi z ukrycia
// ═══════════════════════════════════════════════════════════════

describe('wyjście z trybu cichego', () => {
  function stats(overrides: Partial<AccuracyStats> = {}): AccuracyStats {
    return {
      kind: 'payment.chase',
      radius: 4,
      settled: 200,
      matched: 195,
      accuracy: 98,
      pending: 0,
      ...overrides,
    };
  }

  it('komplet warunków otwiera drogę', () => {
    expect(isReadyToReveal(stats())).toEqual({ ready: true });
  });

  it('za mała próbka zatrzymuje mimo świetnej trafności', () => {
    const verdict = isReadyToReveal(stats({ settled: 40, matched: 40, accuracy: 100 }));
    expect(verdict.ready).toBe(false);
    if (verdict.ready) return;
    expect(verdict.reason).toBe('sample_too_small');
    expect(verdict.detail).toContain('40 z 200');
  });

  it('trafność poniżej progu zatrzymuje mimo dużej próbki', () => {
    const verdict = isReadyToReveal(stats({ matched: 170, accuracy: 85 }));
    expect(verdict.ready).toBe(false);
    if (verdict.ready) return;
    expect(verdict.reason).toBe('below_threshold');
  });

  it('PRZY PROMIENIU 3 JEDEN BŁĄD BLOKUJE WYDANIE', () => {
    // „99% poprawnych kwot podatku" znaczy, że co setny człowiek dostanie złą.
    const verdict = isReadyToReveal(
      stats({ kind: 'tax.deadline', radius: 3, settled: 500, matched: 499, accuracy: 100 }),
    );
    expect(verdict.ready).toBe(false);
    if (verdict.ready) return;
    expect(verdict.reason).toBe('golden_set_failed');
    expect(verdict.detail).toContain('jeden błąd blokuje');
  });

  it('złoty zbiór bez błędu przechodzi', () => {
    expect(
      isReadyToReveal(
        stats({ kind: 'tax.deadline', radius: 3, settled: 40, matched: 40, accuracy: 100 }),
      ),
    ).toEqual({ ready: true });
  });
});

// ═══════════════════════════════════════════════════════════════
// Porównanie propozycji z rzeczywistością
// ═══════════════════════════════════════════════════════════════

describe('co znaczy „trafił"', () => {
  const proposal = { topicKey: 't', fingerprint: 'f', amount: 1_230, entityId: 'inv-1' };

  it('trafienie to TA SAMA rzecz, kwota i encja', () => {
    // Luźniejsza definicja dawałaby trafność bliską stu procent u każdej
    // funkcji i nie mówiłaby nic.
    expect(matchesActual(proposal, { didIt: true, amount: 1_230, entityId: 'inv-1' })).toBe(
      true,
    );
  });

  it('klient nic nie zrobił = pudło', () => {
    expect(matchesActual(proposal, { didIt: false })).toBe(false);
  });

  it('inna kwota = pudło', () => {
    expect(matchesActual(proposal, { didIt: true, amount: 900, entityId: 'inv-1' })).toBe(
      false,
    );
  });

  it('inna encja = pudło', () => {
    expect(matchesActual(proposal, { didIt: true, amount: 1_230, entityId: 'inv-9' })).toBe(
      false,
    );
  });

  it('grosze nie decydują o trafności', () => {
    expect(matchesActual(proposal, { didIt: true, amount: 1_230.005, entityId: 'inv-1' })).toBe(
      true,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Zapis i rozliczenie
// ═══════════════════════════════════════════════════════════════

describe('zapis w trybie cichym', () => {
  it('propozycja ląduje w flo_shadow, nie w wątku klienta', () => {
    const db = createFakeDb();
    return recordShadow(
      {
        tenantId: 't1',
        kind: 'payment.chase',
        proposal: { topicKey: 'k', fingerprint: 'f', amount: 500 },
      },
      db.client,
    ).then(() => {
      expect(db.tables.flo_shadow).toHaveLength(1);
      expect(db.tables.flo_proposals).toHaveLength(0);
      expect(db.tables.flo_shadow[0]!.matched).toBeUndefined();
    });
  });

  it('zapisujemy klucze i kwoty, NIE treść karty', () => {
    const db = createFakeDb();
    return recordShadow(
      {
        tenantId: 't1',
        kind: 'payment.chase',
        proposal: { topicKey: 'k', fingerprint: 'f', amount: 500, entityId: 'inv-1' },
      },
      db.client,
    ).then(() => {
      const stored = db.tables.flo_shadow[0]!.proposal as Record<string, unknown>;
      expect(Object.keys(stored).sort()).toEqual([
        'amount',
        'entityId',
        'fingerprint',
        'topicKey',
      ]);
    });
  });

  it('zadanie porównujące dopisuje wynik', async () => {
    const db = createFakeDb({
      flo_shadow: [
        {
          id: 's1',
          tenant_id: 't1',
          kind: 'payment.chase',
          proposal: { topicKey: 'k', fingerprint: 'f', amount: 500 },
          actual: null,
          matched: null,
        },
      ],
    });

    const matched = await settleShadow(
      {
        shadowId: 's1',
        proposal: { topicKey: 'k', fingerprint: 'f', amount: 500 },
        actual: { didIt: true, amount: 500 },
      },
      db.client,
    );

    expect(matched).toBe(true);
    expect(db.tables.flo_shadow[0]!.matched).toBe(true);
  });
});

describe('trafność per rodzaj', () => {
  const rows = [
    { kind: 'payment.chase', matched: true },
    { kind: 'payment.chase', matched: true },
    { kind: 'payment.chase', matched: false },
    { kind: 'payment.chase', matched: null },
    { kind: 'expense.review', matched: true },
  ];

  it('liczy rozstrzygnięte, trafione i czekające osobno', () => {
    const [chase] = summarizeShadow(rows);
    expect(chase).toMatchObject({
      kind: 'payment.chase',
      radius: 4,
      settled: 3,
      matched: 2,
      accuracy: 67,
      pending: 1,
    });
  });

  it('nieznany rodzaj nie wchodzi do zestawienia', () => {
    const summary = summarizeShadow([...rows, { kind: 'jakiś.śmieć', matched: true }]);
    expect(summary.map((s) => s.kind)).not.toContain('jakiś.śmieć');
  });

  it('czyta z bazy', async () => {
    const db = createFakeDb({
      flo_shadow: rows.map((row, index) => ({ id: `s${index}`, ...row })),
    });
    const summary = await accuracyByKind(db.client);
    expect(summary).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Liczby dla panelu
// ═══════════════════════════════════════════════════════════════

describe('sześć liczb panelu', () => {
  const proposals = [
    { kind: 'payment.chase', status: 'done', undone: false },
    { kind: 'payment.chase', status: 'done', undone: true },
    { kind: 'payment.chase', status: 'expired' },
    { kind: 'payment.chase', status: 'dismissed' },
    { kind: 'expense.review', status: 'blocked' },
  ];

  it('ZIGNOROWANE TO WYGASŁE, nie odrzucone', () => {
    // Odrzucenie jest decyzją („nie chcę tego"); wygaśnięcie znaczy, że
    // karta nie była dość ważna, żeby cokolwiek z nią zrobić. Zlepienie ich
    // ukryłoby różnicę między funkcją niechcianą a niewidoczną.
    const counts = countProposals(proposals.filter((p) => p.kind === 'payment.chase'));
    expect(counts).toEqual({
      total: 4,
      accepted: 2,
      dismissed: 1,
      expired: 1,
      blocked: 0,
      undone: 1,
    });

    const rates = computeRates(counts);
    expect(rates.acceptedPct).toBe(50);
    expect(rates.ignoredPct).toBe(25);
  });

  it('odsetek cofnięć liczony OD PRZYJĘTYCH, nie od wszystkich', () => {
    // Cofnięcie jest miarą tego, jak często agent zrobił coś, czego człowiek
    // po namyśle nie chciał — a namysł dotyczy tylko tego, na co się zgodził.
    const rates = computeRates({
      total: 100,
      accepted: 10,
      dismissed: 0,
      expired: 90,
      blocked: 0,
      undone: 5,
    });
    expect(rates.undonePct).toBe(50);
  });

  it('pusty zestaw nie dzieli przez zero', () => {
    expect(
      computeRates({ total: 0, accepted: 0, dismissed: 0, expired: 0, blocked: 0, undone: 0 }),
    ).toEqual({ acceptedPct: 0, ignoredPct: 0, undonePct: 0 });
  });

  it('panel grupuje per rodzaj, najliczniejsze na górze', () => {
    const rows = buildPanelRows(proposals);
    expect(rows[0]?.kind).toBe('payment.chase');
    expect(rows[0]?.counts.total).toBe(4);
    expect(rows[1]?.kind).toBe('expense.review');
  });

  it('koszt modelu na konto z progami z części II.9', () => {
    const cost = computeCost(
      [
        { tenant_id: 't1', cost_usd: 0.1 },
        { tenant_id: 't1', cost_usd: 0.15 },
        { tenant_id: 't2', cost_usd: 0.9 },
      ],
      4.0,
    );

    expect(cost.tenants).toBe(2);
    expect(cost.totalUsd).toBe(1.15);
    // t1: 0,25 USD = 1,00 zł > 0,95 zł celu; t2: 0,90 USD = 3,60 zł > limitu.
    expect(cost.overTarget).toBe(2);
    expect(cost.overHardLimit).toBe(1);
    expect(COST_TARGET_PLN).toBe(0.95);
    expect(COST_HARD_LIMIT_PLN).toBe(3.0);
  });

  it('liczy AWARIE, DO KTÓRYCH NIE DOSZŁO', async () => {
    // Każde zdarzenie zablokowane przez re-walidację to jedna faktura, która
    // nie poszła podwójnie. Ta metryka ma prawo rosnąć przy rosnącym ruchu.
    const db = createFakeDb({
      flo_proposals: [
        { id: 'p1', status: 'blocked', kind: 'payment.chase' },
        { id: 'p2', status: 'blocked', kind: 'invoice.batch' },
        { id: 'p3', status: 'done', kind: 'payment.chase' },
      ],
    });
    expect(await countBlockedByRevalidation(db.client)).toBe(2);
  });

  it('czyta metryki propozycji i kosztu z bazy', async () => {
    const db = createFakeDb({
      flo_proposals: proposals.map((p, i) => ({ id: `p${i}`, ...p })),
      flo_usage: [{ tenant_id: 't1', day: '2026-09-16', cost_usd: 0.5 }],
    });

    expect(await readProposalMetrics(db.client)).toHaveLength(2);
    expect((await readCostMetrics(4.0, db.client)).tenants).toBe(1);
  });
});
