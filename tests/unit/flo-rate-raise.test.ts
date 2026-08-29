import { describe, expect, it } from 'vitest';

import {
  buildRateRaiseProposal,
  buildRaiseMessage,
  CHASE_BLOCK_DAYS,
  CORRECTION_BLOCK_DAYS,
  decideRateRaise,
  findRepeatableLine,
  impactOfRaise,
  MIN_OCCURRENCES,
  monthsSince,
  raiseBlockers,
  RAISE_AFTER_MONTHS,
  RAISE_TONES,
  recheckBeforeRaiseSend,
  type HistoryLine,
  type RelationshipState,
} from '@/lib/flo/functions/rate-raise';
import { formatPln } from '@/lib/flo/money';

/**
 * P-04 — podwyżka stawki (krok 43). PROMIEŃ RAŻENIA 4.
 *
 * Trzy awarie: liczenie od sumy faktury zamiast per pozycja, wysyłka
 * jednym kliknięciem, podwyżka w najgorszym możliwym momencie.
 */

const TODAY = new Date('2026-09-15T09:00:00.000Z');

function line(overrides: Partial<HistoryLine> = {}): HistoryLine {
  return {
    name: 'Usługa programistyczna',
    unit: 'godz.',
    unitPriceNet: 150,
    quantity: 40,
    issueDate: '2026-08-01',
    ...overrides,
  };
}

/** Stała stawka 150 zł od sierpnia 2024, po 40 godzin miesięcznie. */
function steadyHistory(): HistoryLine[] {
  return [
    line({ issueDate: '2024-08-01' }),
    line({ issueDate: '2025-02-01' }),
    line({ issueDate: '2025-09-01' }),
    line({ issueDate: '2026-03-01' }),
    line({ issueDate: '2026-08-01' }),
  ];
}

function relationship(overrides: Partial<RelationshipState> = {}): RelationshipState {
  return {
    hasOverdueInvoice: false,
    lastChaseAt: null,
    lastCorrectionAt: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// AWARIA 1 — liczenie per pozycja
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 1 — per pozycja, nigdy od sumy faktury', () => {
  it('znajduje stałą pozycję po nazwie I jednostce', () => {
    const found = findRepeatableLine(steadyHistory(), TODAY);
    expect(found?.name).toBe('Usługa programistyczna');
    expect(found?.currentRate).toBe(150);
    expect(found?.occurrences).toBe(5);
  });

  it('ta sama nazwa w innej jednostce to INNA pozycja', () => {
    // Stawka za godzinę jest ceną czasu, stawka za sztukę ceną efektu.
    // Porównywanie ich dawałoby liczby bez sensu.
    const mixed = [
      ...steadyHistory().slice(0, 2),
      line({ unit: 'szt.', unitPriceNet: 4_000, issueDate: '2026-05-01' }),
    ];
    const found = findRepeatableLine(mixed, TODAY);
    expect(found).toBeNull();
  });

  it('faktura, która urosła wolumenem, NIE wygląda jak podwyżka', () => {
    // Klient sprzedał więcej godzin po tej samej cenie. Agent liczący od
    // sumy zobaczyłby wzrost, którego nie było.
    const moreHours = steadyHistory().map((entry, index) =>
      index === 4 ? { ...entry, quantity: 120 } : entry,
    );
    const found = findRepeatableLine(moreHours, TODAY);
    expect(found?.currentRate).toBe(150);
    expect(found?.lastChangedOn).toBe('2024-08-01');
  });

  it('NIEJEDNORODNE POZYCJE = MILCZENIE', () => {
    const oneOffs: HistoryLine[] = [
      line({ name: 'Audyt', issueDate: '2025-01-01' }),
      line({ name: 'Szkolenie', issueDate: '2025-06-01' }),
      line({ name: 'Konsultacja', issueDate: '2026-01-01' }),
    ];
    expect(findRepeatableLine(oneOffs, TODAY)).toBeNull();
    expect(decideRateRaise({ lines: oneOffs, relationship: relationship(), today: TODAY })).toEqual(
      { kind: 'silent', reason: 'no_repeatable_line' },
    );
  });

  it('poniżej progu powtarzalności milczy', () => {
    const rare = steadyHistory().slice(0, MIN_OCCURRENCES - 1);
    expect(findRepeatableLine(rare, TODAY)).toBeNull();
  });

  it('rozpoznaje ostatnią ZMIANĘ stawki, nie pierwszą fakturę', () => {
    const raised = [
      line({ unitPriceNet: 120, issueDate: '2024-08-01' }),
      line({ unitPriceNet: 120, issueDate: '2025-02-01' }),
      line({ unitPriceNet: 150, issueDate: '2025-04-01' }),
      line({ unitPriceNet: 150, issueDate: '2026-01-01' }),
    ];
    expect(findRepeatableLine(raised, TODAY)?.lastChangedOn).toBe('2025-04-01');
  });

  it('skutek roczny liczy się z wolumenu, nie z jednej faktury', () => {
    const found = findRepeatableLine(steadyHistory(), TODAY)!;
    // Ostatnie 12 miesięcy: marzec i sierpień 2026, po 40 godzin.
    expect(found.annualQuantity).toBe(80);
    expect(impactOfRaise(found, 10)).toBe(1_200);
  });

  it('drobne różnice w zapisie nazwy to ta sama pozycja', () => {
    const messy = [
      line({ name: 'Usługa programistyczna', issueDate: '2024-08-01' }),
      line({ name: '  usługa   programistyczna ', issueDate: '2025-06-01' }),
      line({ name: 'USŁUGA PROGRAMISTYCZNA', issueDate: '2026-06-01' }),
    ];
    expect(findRepeatableLine(messy, TODAY)?.occurrences).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 2 — wysyłka jednym kliknięciem
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 2 — karta nie ma przycisku „wyślij"', () => {
  const proposal = buildRateRaiseProposal({
    tenantId: 't1',
    contractorId: 'c1',
    contractorName: 'ACME Sp. z o.o.',
    decision: { lines: steadyHistory(), relationship: relationship(), today: TODAY },
  });

  it('przycisk główny to „Pokaż treść"', () => {
    expect(proposal?.payload?.primaryLabel).toBe('Pokaż treść');
  });

  it('nigdzie na karcie nie pada „wyślij"', () => {
    expect(JSON.stringify(proposal)).not.toMatch(/wyślij/i);
  });

  it('SILNIK NIE WYPUŚCI WIADOMOŚCI, KTÓREJ NIKT NIE CZYTAŁ', () => {
    // Nawet jeżeli interfejs kiedyś się pomyli.
    const result = recheckBeforeRaiseSend({
      relationship: relationship(),
      today: TODAY,
      previewOpened: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('blocked');
    expect(result.message).toContain('Otwórz treść');
  });

  it('po otwarciu treści wysyłka przechodzi', () => {
    expect(
      recheckBeforeRaiseSend({
        relationship: relationship(),
        today: TODAY,
        previewOpened: true,
      }),
    ).toEqual({ ok: true });
  });

  it('trzy tony do wyboru CZŁOWIEKA', () => {
    // Ten sam tekst bywa uprzejmy wobec korporacji i oschły wobec kogoś,
    // z kim klient pracuje od pięciu lat.
    expect(RAISE_TONES).toHaveLength(3);
    expect(proposal?.payload?.tones).toEqual(RAISE_TONES);
  });

  it('każdy ton niesie starą i nową stawkę oraz datę', () => {
    const found = findRepeatableLine(steadyHistory(), TODAY)!;
    for (const tone of RAISE_TONES) {
      const message = buildRaiseMessage({
        contractorName: 'ACME',
        line: found,
        newRate: 170,
        effectiveFrom: '2026-11-01',
        tone,
      });
      expect(message).toContain(formatPln(170));
      expect(message).toContain(formatPln(150));
      expect(message).toContain('1.11.2026');
    }
  });

  it('AGENT NIE USTALA CENY — pokazuje skutek, decyzja jest u człowieka', () => {
    expect(proposal?.body).toContain('decydujesz Ty');
    expect(proposal?.body).toContain('każde 10%');
    expect(proposal?.payload?.impactPerStep).toBe(1_200);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 3 — najgorszy możliwy moment
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 3 — trzy blokady', () => {
  it('otwarta faktura po terminie blokuje', () => {
    expect(raiseBlockers(relationship({ hasOverdueInvoice: true }), TODAY)).toEqual([
      'overdue_invoice',
    ]);
  });

  it('ponaglenie w ostatnich 90 dniach blokuje', () => {
    const recent = new Date(TODAY.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    expect(raiseBlockers(relationship({ lastChaseAt: recent }), TODAY)).toEqual([
      'recent_chase',
    ]);
  });

  it('korekta w ostatnich 30 dniach blokuje', () => {
    const recent = new Date(TODAY.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
    expect(raiseBlockers(relationship({ lastCorrectionAt: recent }), TODAY)).toEqual([
      'recent_correction',
    ]);
  });

  it('stare zdarzenia już nie blokują', () => {
    const oldChase = new Date(TODAY.getTime() - (CHASE_BLOCK_DAYS + 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const oldCorrection = new Date(TODAY.getTime() - (CORRECTION_BLOCK_DAYS + 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      raiseBlockers(relationship({ lastChaseAt: oldChase, lastCorrectionAt: oldCorrection }), TODAY),
    ).toEqual([]);
  });

  it('zablokowany kontrahent nie dostaje karty', () => {
    expect(
      buildRateRaiseProposal({
        tenantId: 't1',
        contractorId: 'c1',
        contractorName: 'ACME',
        decision: {
          lines: steadyHistory(),
          relationship: relationship({ hasOverdueInvoice: true }),
          today: TODAY,
        },
      }),
    ).toBeNull();
  });

  it('BLOKADA SPRAWDZANA PONOWNIE PRZY KLIKNIĘCIU', () => {
    // Karta o podwyżce potrafi leżeć w wątku tygodniami; w tym czasie
    // kontrahent mógł przestać płacić.
    const result = recheckBeforeRaiseSend({
      relationship: relationship({ hasOverdueInvoice: true }),
      today: TODAY,
      previewOpened: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('stale');
    expect(result.message).toContain('niezapłaconą fakturę po terminie');
  });

  it('komunikat blokady tłumaczy, a nie odmawia', () => {
    const recent = new Date(TODAY.getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
    const result = recheckBeforeRaiseSend({
      relationship: relationship({ lastChaseAt: recent }),
      today: TODAY,
      previewOpened: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('ponaglenie');
  });
});

// ═══════════════════════════════════════════════════════════════
// Okno czasowe
// ═══════════════════════════════════════════════════════════════

describe('dwanaście miesięcy', () => {
  it('liczy miesiące od ostatniej zmiany', () => {
    expect(monthsSince('2024-08-01', TODAY)).toBe(25);
  });

  it('świeża stawka nie zasługuje na rozmowę', () => {
    const fresh = [
      line({ unitPriceNet: 120, issueDate: '2025-01-01' }),
      line({ unitPriceNet: 150, issueDate: '2026-05-01' }),
      line({ unitPriceNet: 150, issueDate: '2026-08-01' }),
    ];
    expect(
      decideRateRaise({ lines: fresh, relationship: relationship(), today: TODAY }),
    ).toEqual({ kind: 'silent', reason: 'too_soon' });
    expect(monthsSince('2026-05-01', TODAY)).toBeLessThan(RAISE_AFTER_MONTHS);
  });

  it('wygasła współpraca to nie temat na podwyżkę', () => {
    // Pozycja jest w historii, ale nie w ostatnim roku.
    const stale = [
      line({ issueDate: '2023-01-01' }),
      line({ issueDate: '2023-06-01' }),
      line({ issueDate: '2024-01-01' }),
    ];
    expect(
      decideRateRaise({ lines: stale, relationship: relationship(), today: TODAY }),
    ).toEqual({ kind: 'silent', reason: 'no_volume' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

describe('karta P-04', () => {
  const proposal = buildRateRaiseProposal({
    tenantId: 't1',
    contractorId: 'c1',
    contractorName: 'ACME Sp. z o.o.',
    decision: { lines: steadyHistory(), relationship: relationship(), today: TODAY },
  });

  it('jeden kontrahent i jedna pozycja = jedna rozmowa', () => {
    expect(proposal?.topicKey).toBe('invoice.raise:c1:usługa programistyczna');
  });

  it('mówi, od kiedy stawka stoi', () => {
    expect(proposal?.title).toContain('25 miesięcy');
    expect(proposal?.body).toContain('1.08.2024');
  });

  it('zmiana stawki zmienia odcisk danych', () => {
    const raised = buildRateRaiseProposal({
      tenantId: 't1',
      contractorId: 'c1',
      contractorName: 'ACME Sp. z o.o.',
      decision: {
        lines: steadyHistory().map((entry) => ({ ...entry, unitPriceNet: 170 })),
        relationship: relationship(),
        today: TODAY,
      },
    });
    expect(raised?.fingerprint).not.toBe(proposal?.fingerprint);
  });
});
