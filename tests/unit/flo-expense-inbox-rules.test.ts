import { describe, expect, it } from 'vitest';

import {
  buildInboxSummaryProposal,
  classifyInboxDocuments,
  cursorMatchesWindow,
  evaluateContinuity,
  pairReceiptsWithInvoices,
  type InboxDocument,
  type PairCandidate,
} from '@/lib/flo/functions/expense-inbox';
import {
  buildRuleProposal,
  computeBounds,
  invalidatesRules,
  ruleApplies,
  ruleSourceMarker,
  type StoredRule,
} from '@/lib/flo/functions/expense-rules';

/**
 * W-02 koszty ze skrzynki KSeF (krok 19) i W-03 nauka reguł (krok 20).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// W-02
// ═══════════════════════════════════════════════════════════════

function doc(overrides: Partial<InboxDocument> = {}): InboxDocument {
  return {
    id: 'doc-1',
    sellerName: 'Orlen',
    sellerNip: '7740001454',
    grossAmount: 312.4,
    issueDate: '2026-08-22',
    ...overrides,
  };
}

const known = new Set(['7740001454']);

describe('W-02 — klasyfikacja dokumentów', () => {
  it('znany sprzedawca idzie do księgi', () => {
    const [result] = classifyInboxDocuments([doc()], known);
    expect(result!.decision).toBe('recognized');
  });

  it('AWARIA: cudza faktura od nieznanego sprzedawcy czeka na decyzję', () => {
    // Kontrahent pomylił NIP. Dokument nie ma prawa trafić sam do księgi.
    const [result] = classifyInboxDocuments(
      [doc({ sellerNip: '1111111111', grossAmount: 4200 })],
      known,
    );
    expect(result!.decision).toBe('needs_decision');
    expect(result!.reason).toContain('nieznany');
  });

  it('drobna kwota od nieznanego sprzedawcy nie blokuje', () => {
    // Pytanie o każdy drobiazg to udręka, a ryzyko jest małe.
    const [result] = classifyInboxDocuments(
      [doc({ sellerNip: '1111111111', grossAmount: 42 })],
      known,
    );
    expect(result!.decision).toBe('recognized');
  });

  it('niepełne dane sprzedawcy zawsze do decyzji', () => {
    const [result] = classifyInboxDocuments([doc({ sellerNip: null })], known);
    expect(result!.decision).toBe('needs_decision');
  });
});

describe('W-02 — jedna karta zamiast pięciu powiadomień', () => {
  it('streszcza cały przebieg w jednym zdaniu', () => {
    const documents = classifyInboxDocuments(
      [
        doc({ id: 'a' }),
        doc({ id: 'b', grossAmount: 120 }),
        doc({ id: 'c', sellerNip: '1111111111', grossAmount: 900 }),
      ],
      known,
    );

    const proposal = buildInboxSummaryProposal({
      tenantId: 'ten-1',
      documents,
      periodKey: '2026-08-26',
      now: NOW,
    })!;

    expect(proposal.title).toContain('3 nowe koszty');
    expect(proposal.title).toContain('do decyzji');
    expect(proposal.body).toContain('1 332,40 zł');
    expect(proposal.payload?.needsDecisionIds).toEqual(['c']);
  });

  it('odmienia liczebnik poprawnie', () => {
    const one = buildInboxSummaryProposal({
      tenantId: 'ten-1',
      documents: classifyInboxDocuments([doc()], known),
      periodKey: 'p',
      now: NOW,
    })!;
    const five = buildInboxSummaryProposal({
      tenantId: 'ten-1',
      documents: classifyInboxDocuments(
        Array.from({ length: 5 }, (_, i) => doc({ id: `d${i}` })),
        known,
      ),
      periodKey: 'p',
      now: NOW,
    })!;

    expect(one.title).toContain('1 nowy koszt');
    expect(five.title).toContain('5 nowych kosztów');
  });

  it('brak dokumentów to brak karty', () => {
    // Cisza jest dobrą wiadomością. Karta „zero nowych kosztów" to hałas.
    expect(
      buildInboxSummaryProposal({
        tenantId: 'ten-1',
        documents: [],
        periodKey: 'p',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('kolejny przebieg tego dnia aktualizuje tę samą kartę', () => {
    const a = buildInboxSummaryProposal({
      tenantId: 'ten-1',
      documents: classifyInboxDocuments([doc()], known),
      periodKey: '2026-08-26',
      now: NOW,
    })!;
    const b = buildInboxSummaryProposal({
      tenantId: 'ten-1',
      documents: classifyInboxDocuments([doc(), doc({ id: 'x' })], known),
      periodKey: '2026-08-26',
      now: NOW,
    })!;
    expect(a.topicKey).toBe(b.topicKey);
  });
});

describe('W-02 — pary paragon i faktura', () => {
  const base: PairCandidate[] = [
    {
      id: 'r1',
      source: 'receipt',
      sellerName: 'Orlen S.A.',
      grossAmount: 312.4,
      issueDate: '2026-08-22',
    },
    {
      id: 'f1',
      source: 'ksef',
      sellerName: 'ORLEN SA',
      grossAmount: 312.4,
      issueDate: '2026-08-24',
    },
  ];

  it('łączy ten sam zakup mimo różnego zapisu nazwy', () => {
    const pairs = pairReceiptsWithInvoices(base);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ receiptId: 'r1', invoiceId: 'f1' });
  });

  it('nie łączy przy różnicy dat powyżej tolerancji', () => {
    const far = [...base];
    far[1] = { ...far[1]!, issueDate: '2026-09-05' };
    expect(pairReceiptsWithInvoices(far)).toHaveLength(0);
  });

  it('nie łączy przy innej kwocie', () => {
    const other = [...base];
    other[1] = { ...other[1]!, grossAmount: 315.0 };
    expect(pairReceiptsWithInvoices(other)).toHaveLength(0);
  });

  it('jedna faktura nie łączy się z dwoma paragonami', () => {
    const withExtra: PairCandidate[] = [
      ...base,
      {
        id: 'r2',
        source: 'receipt',
        sellerName: 'Orlen S.A.',
        grossAmount: 312.4,
        issueDate: '2026-08-23',
      },
    ];
    expect(pairReceiptsWithInvoices(withExtra)).toHaveLength(1);
  });
});

describe('W-02 — ciągłość pobierania', () => {
  it('AWARIA: urwane pobieranie wznawia się od kursora', () => {
    // Najgroźniejsza awaria z tej funkcji, bo cicha: brakujący koszt to
    // zawyżony podatek, o którym klient nie ma jak się dowiedzieć.
    const verdict = evaluateContinuity({
      continuationToken: 'token-strona-3',
      windowFrom: null,
      windowTo: null,
      announcedCount: 50,
      savedCount: 20,
    });
    expect(verdict).toEqual({ status: 'resume', token: 'token-strona-3' });
  });

  it('alarmuje, gdy token się skończył, a liczby się nie zgadzają', () => {
    const verdict = evaluateContinuity({
      continuationToken: null,
      windowFrom: null,
      windowTo: null,
      announcedCount: 50,
      savedCount: 47,
    });
    expect(verdict.status).toBe('incomplete');
    if (verdict.status === 'incomplete') {
      expect(verdict.missing).toBe(3);
      expect(verdict.message).toContain('Brakuje 3');
    }
  });

  it('komplet to komplet', () => {
    expect(
      evaluateContinuity({
        continuationToken: null,
        windowFrom: null,
        windowTo: null,
        announcedCount: 12,
        savedCount: 12,
      }),
    ).toEqual({ status: 'complete' });
  });

  it('kursor z innego okna dat jest bezużyteczny', () => {
    // Token paginacji dotyczy konkretnego zapytania. Użycie go po zmianie
    // okna dałoby wyniki z innego zakresu i cichą lukę w danych.
    const state = {
      continuationToken: 't',
      windowFrom: '2026-08-01T00:00:00.000Z',
      windowTo: '2026-08-26T00:00:00.000Z',
      announcedCount: 0,
      savedCount: 0,
    };
    expect(
      cursorMatchesWindow(state, new Date('2026-08-01'), new Date('2026-08-26')),
    ).toBe(true);
    expect(
      cursorMatchesWindow(state, new Date('2026-08-02'), new Date('2026-08-27')),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// W-03
// ═══════════════════════════════════════════════════════════════

function rule(overrides: Partial<StoredRule> = {}): StoredRule {
  return {
    id: 'rule-1',
    matchValue: '5252445767',
    kpirColumn: 'col_13',
    categoryLabel: 'oprogramowanie',
    minAmount: 40,
    maxAmount: 250,
    createdAt: '2026-06-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('W-03 — widełki kwotowe', () => {
  it('AWARIA: reguła nauczona na wyjątku nie księguje zakupu innej klasy', () => {
    // Media Markt: raz towar handlowy za 200 zł, potem laptop za 8000.
    // Bez widełek reguła księgowałaby tak samo — cicho, przez miesiące.
    const verdict = ruleApplies(rule({ minAmount: 80, maxAmount: 500 }), 8000);
    expect(verdict.applies).toBe(false);
    if (!verdict.applies) expect(verdict.reason).toBe('out_of_bounds');
  });

  it('w widełkach reguła działa bez pytania', () => {
    expect(ruleApplies(rule(), 120).applies).toBe(true);
  });

  it('kwota poniżej dolnej granicy też pyta', () => {
    expect(ruleApplies(rule(), 5).applies).toBe(false);
  });

  it('reguła sprzed migracji, bez widełek, działa jak dotąd', () => {
    // Nie zmieniamy zachowania rzeczy, które już działają.
    const legacy = rule({ minAmount: null, maxAmount: null });
    expect(ruleApplies(legacy, 999999).applies).toBe(true);
  });

  it('widełki liczone z historii, nie z powietrza', () => {
    const bounds = computeBounds([100, 120, 150]);
    expect(bounds.minAmount).toBeCloseTo(40, 5);
    expect(bounds.maxAmount).toBeCloseTo(375, 5);
  });

  it('brak historii daje puste widełki', () => {
    expect(computeBounds([])).toEqual({ minAmount: 0, maxAmount: 0 });
  });
});

describe('W-03 — „kto to zaksięgował”', () => {
  it('AWARIA: znacznik źródła mówi co, kiedy i gdzie wyłączyć', () => {
    const marker = ruleSourceMarker(rule({ matchValue: 'Adobe' }));
    expect(marker.label).toContain('Adobe');
    expect(marker.label).toContain('oprogramowanie');
    expect(marker.createdAt).toBe('2026-06-12T10:00:00.000Z');
    expect(marker.href).toContain('rule-1');
  });
});

describe('W-03 — propozycja nauki', () => {
  it('pyta dopiero przy drugim wystąpieniu', () => {
    const once = buildRuleProposal({
      tenantId: 'ten-1',
      sellerName: 'Adobe',
      sellerNip: '5252445767',
      categoryLabel: 'oprogramowanie',
      kpirColumn: 'col_13',
      amounts: [99],
      now: NOW,
    });
    expect(once).toBeNull();
  });

  it('mówi wprost, jakich kwot reguła dotyczy', () => {
    // Klient ma wiedzieć, na co się zgadza. „Zawsze tak księguj" bez zakresu
    // to zgoda w ciemno.
    const proposal = buildRuleProposal({
      tenantId: 'ten-1',
      sellerName: 'Adobe',
      sellerNip: '5252445767',
      categoryLabel: 'oprogramowanie',
      kpirColumn: 'col_13',
      amounts: [99, 99],
      now: NOW,
    })!;

    expect(proposal.title).toContain('Adobe');
    expect(proposal.body).toContain('od 39,60 zł');
    expect(proposal.body).toContain('do 247,50 zł');
    expect(proposal.body).toContain('przy większych i tak zapytam');
    expect(proposal.payload?.minAmount).toBeCloseTo(39.6, 5);
  });
});

describe('W-03 — zmiana profilu podatkowego', () => {
  it('AWARIA: zmiana formy unieważnia reguły', () => {
    // Ryczałtowiec nie prowadzi księgi przychodów i rozchodów — jego reguły
    // przestają cokolwiek znaczyć.
    expect(
      invalidatesRules({ form: 'skala', vat: true }, { form: 'ryczalt', vat: true }),
    ).toBe(true);
  });

  it('zmiana statusu VAT też unieważnia', () => {
    expect(
      invalidatesRules({ form: 'skala', vat: false }, { form: 'skala', vat: true }),
    ).toBe(true);
  });

  it('brak zmiany nic nie rusza', () => {
    expect(
      invalidatesRules({ form: 'skala', vat: true }, { form: 'skala', vat: true }),
    ).toBe(false);
  });

  it('brak profilu po którejś stronie nie kasuje niczego', () => {
    // Nie wolno kasować cudzej pracy na podstawie niewiedzy.
    expect(invalidatesRules(null, { form: 'skala', vat: true })).toBe(false);
    expect(invalidatesRules({ form: 'skala', vat: true }, null)).toBe(false);
  });
});
