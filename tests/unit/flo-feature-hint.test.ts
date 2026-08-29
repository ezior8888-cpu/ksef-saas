import { describe, expect, it } from 'vitest';

import {
  buildHintProposal,
  findHintRule,
  HINT_COOLDOWN_DAYS,
  HINT_DISMISSALS_LIMIT,
  HINT_RULES,
  isHintAllowed,
  pickHint,
  type HintKey,
  type HintState,
} from '@/lib/flo/functions/feature-hint';

/**
 * O-03 — podpowiadanie funkcji (krok 48).
 *
 * Definicja gotowości z planu: FUNKCJA JUŻ UŻYWANA NIE JEST PODPOWIADANA.
 */

const TODAY = new Date('2026-09-16T09:00:00.000Z');
const ALL_FEATURES = HINT_RULES.map((rule) => rule.feature);

function state(overrides: Partial<HintState> = {}): HintState {
  return {
    usedFeatures: [],
    dismissals: {},
    lastHintAt: null,
    availableFeatures: ALL_FEATURES,
    processInProgress: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEFINICJA GOTOWOŚCI
// ═══════════════════════════════════════════════════════════════

describe('funkcja już używana nie jest podpowiadana', () => {
  it('klient korzystający z ponagleń nie usłyszy o ponagleniach', () => {
    // Sugerowanie komuś czegoś, co robi od miesiąca, jest dowodem, że
    // program go nie ogląda.
    const verdict = pickHint(
      ['chase_templates'],
      state({ usedFeatures: ['K-02'] }),
      TODAY,
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'all_filtered' });
  });

  it('ale usłyszy o innej funkcji, której nie używa', () => {
    const verdict = pickHint(
      ['chase_templates', 'receipt_photo'],
      state({ usedFeatures: ['K-02'] }),
      TODAY,
    );
    expect(verdict.kind).toBe('hint');
    if (verdict.kind !== 'hint') return;
    expect(verdict.rule.key).toBe('receipt_photo');
  });

  it('karta nie powstaje dla używanej funkcji', () => {
    expect(
      buildHintProposal({
        tenantId: 't1',
        signals: ['chase_templates'],
        state: state({ usedFeatures: ['K-02'] }),
        today: TODAY,
      }),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Cztery bezpieczniki
// ═══════════════════════════════════════════════════════════════

describe('bezpiecznik 1 — nigdy w trakcie rozpoczętego procesu', () => {
  it('podpowiedź w środku wystawiania faktury to przerwanie, nie pomoc', () => {
    expect(pickHint(['vat_limit'], state({ processInProgress: true }), TODAY)).toEqual({
      kind: 'silent',
      reason: 'process_in_progress',
    });
  });

  it('trwający proces wygrywa nawet z najpilniejszym sygnałem', () => {
    const verdict = pickHint(
      ['vat_limit', 'chase_templates'],
      state({ processInProgress: true }),
      TODAY,
    );
    expect(verdict.kind).toBe('silent');
  });
});

describe('bezpiecznik 2 — jedna podpowiedź tygodniowo', () => {
  it('sześć dni po ostatniej: cisza', () => {
    const recent = new Date(TODAY.getTime() - 6 * 86_400_000).toISOString();
    expect(pickHint(['vat_limit'], state({ lastHintAt: recent }), TODAY)).toEqual({
      kind: 'silent',
      reason: 'cooldown',
    });
  });

  it('po tygodniu wolno znowu', () => {
    const old = new Date(TODAY.getTime() - (HINT_COOLDOWN_DAYS + 1) * 86_400_000).toISOString();
    expect(pickHint(['vat_limit'], state({ lastHintAt: old }), TODAY).kind).toBe('hint');
  });

  it('odstęp sprawdzany PRZED filtrowaniem sygnałów', () => {
    // Odwrotna kolejność zużywałaby tydzień limitu na podpowiedź, której
    // i tak nie wolno pokazać.
    const recent = new Date(TODAY.getTime() - 2 * 86_400_000).toISOString();
    const verdict = pickHint(
      ['chase_templates'],
      state({ lastHintAt: recent, usedFeatures: ['K-02'] }),
      TODAY,
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'cooldown' });
  });
});

describe('bezpiecznik 3 — dwa odrzucenia kasują typ TRWALE', () => {
  it('po dwóch „nie" ta podpowiedź nie wraca nigdy', () => {
    // Nie 90 dni ciszy jak przy zwykłym wyciszeniu — koniec.
    const twice = state({ dismissals: { receipt_photo: HINT_DISMISSALS_LIMIT } });
    expect(pickHint(['receipt_photo'], twice, TODAY)).toEqual({
      kind: 'silent',
      reason: 'all_filtered',
    });

    // Także za rok.
    const muchLater = new Date(TODAY.getTime() + 400 * 86_400_000);
    expect(pickHint(['receipt_photo'], twice, muchLater).kind).toBe('silent');
  });

  it('po jednym odrzuceniu jeszcze wolno spróbować', () => {
    const once = state({ dismissals: { receipt_photo: 1 } });
    expect(pickHint(['receipt_photo'], once, TODAY).kind).toBe('hint');
  });
});

describe('bezpiecznik 4 — tylko funkcje z planu klienta', () => {
  it('wątek FLO nie jest miejscem na sprzedaż', () => {
    const limited = state({ availableFeatures: ['W-01'] });
    expect(pickHint(['accountant_package'], limited, TODAY)).toEqual({
      kind: 'silent',
      reason: 'all_filtered',
    });
    expect(pickHint(['receipt_photo'], limited, TODAY).kind).toBe('hint');
  });
});

// ═══════════════════════════════════════════════════════════════
// Tabela reguł
// ═══════════════════════════════════════════════════════════════

describe('tabela reguł z planu', () => {
  it('siedem sygnałów, każdy z własną funkcją', () => {
    expect(HINT_RULES).toHaveLength(7);
    const features = HINT_RULES.map((rule) => rule.feature);
    expect(new Set(features).size).toBe(7);
    expect(features).toEqual(
      expect.arrayContaining(['K-02', 'W-01', 'B-01', 'P-02', 'T-02', 'P-09', 'W-04']),
    );
  });

  it('licznik limitu VAT wygrywa z innymi sygnałami', () => {
    // To jedyna pozycja, w której zwłoka kosztuje pieniądze, a nie wygodę.
    const verdict = pickHint(
      ['expense_hunter', 'chase_templates', 'vat_limit'],
      state(),
      TODAY,
    );
    expect(verdict.kind).toBe('hint');
    if (verdict.kind !== 'hint') return;
    expect(verdict.rule.key).toBe('vat_limit');
  });

  it('każda reguła ma treść, przycisk i dokąd prowadzi', () => {
    for (const rule of HINT_RULES) {
      expect(rule.title.length).toBeGreaterThan(10);
      expect(rule.body.length).toBeGreaterThan(20);
      expect(rule.action.length).toBeGreaterThan(3);
      expect(rule.href.startsWith('/')).toBe(true);
    }
  });

  it('filtr działa też pojedynczo', () => {
    const rule = findHintRule('vat_limit')!;
    expect(isHintAllowed(rule, state())).toBe(true);
    expect(isHintAllowed(rule, state({ usedFeatures: ['T-02'] }))).toBe(false);
  });

  it('brak sygnałów to cisza, nie losowa podpowiedź', () => {
    expect(pickHint([], state(), TODAY)).toEqual({ kind: 'silent', reason: 'no_signal' });
  });

  it('nieznany sygnał nic nie wywołuje', () => {
    expect(pickHint(['nieistniejący' as HintKey], state(), TODAY).kind).toBe('silent');
  });
});

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

describe('karta O-03', () => {
  const proposal = buildHintProposal({
    tenantId: 't1',
    signals: ['receipt_photo'],
    state: state(),
    today: TODAY,
  });

  it('NAJNIŻSZY PRIORYTET w wątku', () => {
    // Gdy tego dnia jest cokolwiek pilnego, podpowiedź czeka pod spodem.
    expect(proposal?.priority).toBe(90);
  });

  it('BEZ POWIADOMIENIA — wyłącznie w wątku', () => {
    // Bez okien i bez dymków.
    expect(proposal?.payload?.noPush).toBe(true);
  });

  it('niczego nie wykonuje — prowadzi do funkcji', () => {
    expect(proposal?.payload?.primaryIntent).toBe('open');
    expect(proposal?.payload?.primaryLabel).toBe('Pokaż jak');
  });

  it('ta sama podpowiedź nie wraca co miesiąc', () => {
    expect(proposal?.topicKey).toBe('feature.hint:receipt_photo');
  });

  it('podpowiedź żyje dwa tygodnie', () => {
    const days = (proposal!.expiresAt.getTime() - TODAY.getTime()) / 86_400_000;
    expect(days).toBe(14);
  });
});
