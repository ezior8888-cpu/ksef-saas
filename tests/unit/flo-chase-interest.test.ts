import { describe, expect, it } from 'vitest';

import {
  buildChaseProposal,
  DISCLAIMER,
  evaluateChaseSafety,
  SAFETY_WINDOW_MS,
  validateRecipient,
} from '@/lib/flo/functions/payment-chase';
import {
  calculateInterest,
  formatInterestBreakdown,
  INTEREST_RATES,
  MIN_INTEREST_PLN,
  RATES_VERIFIED,
  shouldOfferInterest,
} from '@/lib/flo/interest';
import { DEFAULT_TEMPLATES } from '@/lib/reminders/templates';

/**
 * K-02 ponaglenia (krok 23) i K-05 odsetki (krok 24).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// K-02
// ═══════════════════════════════════════════════════════════════

describe('K-02 — okno bezpieczeństwa', () => {
  it('SCENARIUSZ Z PLANU: wpłata w międzyczasie — nic nie wychodzi', () => {
    // To jest ta jedna awaria, której nie da się cofnąć: wiadomość do obcej
    // firmy o długu, który został spłacony wczoraj.
    const verdict = evaluateChaseSafety({
      outstanding: 4300,
      lastPaymentFromContractorAt: '2026-08-25T18:00:00.000Z',
      remindersPaused: false,
      now: NOW,
    });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe('recent_payment');
      expect(verdict.message.toLowerCase()).toContain('nie wysyłam');
    }
  });

  it('blokada działa nawet gdy wpłata nie dotyczy TEJ faktury', () => {
    // Księgowanie bywa wolniejsze niż przelew. „Ten człowiek właśnie
    // zapłacił" wystarczy, żeby się wstrzymać.
    const verdict = evaluateChaseSafety({
      outstanding: 9000,
      lastPaymentFromContractorAt: new Date(
        NOW.getTime() - SAFETY_WINDOW_MS + 60_000,
      ).toISOString(),
      remindersPaused: false,
      now: NOW,
    });
    expect(verdict.ok).toBe(false);
  });

  it('po oknie bezpieczeństwa wysyłka jest możliwa', () => {
    const verdict = evaluateChaseSafety({
      outstanding: 4300,
      lastPaymentFromContractorAt: new Date(
        NOW.getTime() - SAFETY_WINDOW_MS - 60_000,
      ).toISOString(),
      remindersPaused: false,
      now: NOW,
    });
    expect(verdict.ok).toBe(true);
  });

  it('opłacona faktura i wstrzymane przypomnienia blokują', () => {
    expect(
      evaluateChaseSafety({
        outstanding: 0,
        lastPaymentFromContractorAt: null,
        remindersPaused: false,
        now: NOW,
      }).ok,
    ).toBe(false);

    expect(
      evaluateChaseSafety({
        outstanding: 4300,
        lastPaymentFromContractorAt: null,
        remindersPaused: true,
        now: NOW,
      }).ok,
    ).toBe(false);
  });
});

describe('K-02 — adresat', () => {
  const bounced = new Set(['zly@firma.pl']);

  it('agent NIGDY nie zgaduje adresu', () => {
    const verdict = validateRecipient(null, bounced);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('missing');
  });

  it('odrzuca adres, z którego wiadomość już wróciła', () => {
    const verdict = validateRecipient('zly@firma.pl', bounced);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('bounced');
  });

  it('odrzuca adres o niepoprawnym formacie', () => {
    expect(validateRecipient('to nie jest adres', bounced).ok).toBe(false);
  });

  it('normalizuje poprawny adres', () => {
    const verdict = validateRecipient('  Anna@Biuro.PL ', bounced);
    expect(verdict).toEqual({ ok: true, email: 'anna@biuro.pl' });
  });
});

describe('K-02 — karta', () => {
  const base = {
    tenantId: 'ten-1',
    invoiceId: 'inv-1',
    invoiceNumber: '5/2026',
    contractorName: 'Nowak Sp. z o.o.',
    outstanding: 4300,
    daysOverdue: 8,
    stage: 'stage_1',
    facts: { grossTotal: 4300, paidAmount: 0 },
    now: NOW,
  };

  it('brak adresu zamienia kartę w pytanie o dane', () => {
    // Blokowanie sprawy z powodu braku adresu byłoby ślepym zaułkiem.
    const proposal = buildChaseProposal({ ...base, recipientEmail: null });
    expect(proposal.payload?.inputKind).toBe('email');
    expect(proposal.payload?.primaryLabel).toContain('adres');
  });

  it('przy największym kliencie proponuje najpierw telefon', () => {
    // Agent, który popycha do zerwania relacji żywiącej firmę, ma formalnie
    // rację i realnie szkodzi.
    const proposal = buildChaseProposal({
      ...base,
      recipientEmail: 'k@nowak.pl',
      revenueShare: 0.45,
    });
    expect(proposal.body).toContain('największy klient');
    expect(proposal.body).toContain('telefon');
  });

  it('przy zwykłym kontrahencie nie dokłada zdania o telefonie', () => {
    const proposal = buildChaseProposal({
      ...base,
      recipientEmail: 'k@nowak.pl',
      revenueShare: 0.05,
    });
    expect(proposal.body).not.toContain('telefon');
  });

  it('znacznik „traktuj delikatnie" jedzie w ładunku', () => {
    const proposal = buildChaseProposal({
      ...base,
      recipientEmail: 'k@nowak.pl',
      gentle: true,
    });
    expect(proposal.payload?.gentle).toBe(true);
  });

  it('karta żyje krótko — sytuacja zmienia się z dnia na dzień', () => {
    const proposal = buildChaseProposal({ ...base, recipientEmail: 'k@nowak.pl' });
    const hours =
      (proposal.expiresAt.getTime() - NOW.getTime()) / 3_600_000;
    expect(hours).toBeLessThanOrEqual(48);
  });
});

describe('K-02 — trzecia warstwa obrony jest w treści maila', () => {
  it('KAŻDY etap ponaglenia zawiera zdanie ratunkowe', () => {
    // Im ostrzejsza wiadomość, tym większa szkoda, jeśli adresat już zapłacił.
    // Etapy 2-4 tego zdania nie miały — dopisane w kroku 23.
    for (const [stage, template] of Object.entries(DEFAULT_TEMPLATES)) {
      const body = template.body.toLowerCase();
      const hasEscape =
        body.includes('nieaktualn') ||
        body.includes('w drodze') ||
        body.includes('zignorować');
      expect(hasEscape, `etap ${stage} bez zdania ratunkowego`).toBe(true);
    }
  });

  it('stała z treścią zdania jest zdefiniowana', () => {
    expect(DISCLAIMER).toContain('nieaktualną');
  });
});

// ═══════════════════════════════════════════════════════════════
// K-05
// ═══════════════════════════════════════════════════════════════

describe('K-05 — bezpiecznik na niesprawdzone stawki', () => {
  it('agent NIE proponuje odsetek, dopóki stawki nie są potwierdzone', () => {
    // Wartości stóp to dane prawne. Wyliczanie klientowi kwoty, której nie
    // umiemy obronić, jest gorsze niż brak funkcji.
    expect(RATES_VERIFIED).toBe(false);
    expect(shouldOfferInterest({ total: 500, clientOptedIn: true })).toBe(false);
  });

  it('każda pozycja tabeli ma pole źródła — puste znaczy niesprawdzone', () => {
    for (const entry of INTEREST_RATES) {
      expect(entry).toHaveProperty('source');
      expect(entry.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Gdy ktoś uzupełni źródła i przestawi flagę, ten test przypomni, że
    // jedno bez drugiego nie ma sensu.
    const allSourced = INTEREST_RATES.every((e) => e.source.length > 0);
    expect(RATES_VERIFIED).toBe(allSourced && RATES_VERIFIED);
  });
});

describe('K-05 — naliczanie (złoty zbiór)', () => {
  // Wzór: kapitał × stawka × dni / 365, liczony osobno w każdym podokresie.
  // Wartości oczekiwane wyliczone ręcznie z tabeli stóp w lib/flo/interest.ts.

  it('pełny rok przy jednej stawce', () => {
    const result = calculateInterest({
      principal: 10000,
      from: '2026-01-01',
      to: '2027-01-01',
      kind: 'statutory_late',
    });
    // 10000 × 0,105 × 365/365 = 1050,00
    expect(result.total).toBeCloseTo(1050, 2);
    expect(result.periods).toHaveLength(1);
  });

  it('trzydzieści dni', () => {
    const result = calculateInterest({
      principal: 4300,
      from: '2026-08-01',
      to: '2026-08-31',
      kind: 'statutory_late',
    });
    // 4300 × 0,105 × 30/365 = 37,11
    expect(result.total).toBeCloseTo(37.11, 2);
  });

  it('stawka handlowa jest wyższa od ustawowej', () => {
    const args = { principal: 4300, from: '2026-08-01', to: '2026-08-31' } as const;
    const statutory = calculateInterest({ ...args, kind: 'statutory_late' });
    const commercial = calculateInterest({ ...args, kind: 'commercial' });
    expect(commercial.total).toBeGreaterThan(statutory.total);
    // 4300 × 0,145 × 30/365 = 51,25
    expect(commercial.total).toBeCloseTo(51.25, 2);
  });

  it('PRZEŁOM ZMIANY STOPY dzieli naliczenie na podokresy', () => {
    // Zaległość przez zmianę stopy naliczona jedną stawką daje kwotę,
    // której klient nie obroni przed kontrahentem.
    const result = calculateInterest({
      principal: 10000,
      from: '2025-12-17',
      to: '2026-01-16',
      kind: 'statutory_late',
    });

    expect(result.periods).toHaveLength(2);
    expect(result.periods[0]!.rate).toBeCloseTo(0.115, 5);
    expect(result.periods[1]!.rate).toBeCloseTo(0.105, 5);
    // 10000×0,115×15/365 = 47,26 ; 10000×0,105×15/365 = 43,15
    expect(result.periods[0]!.amount).toBeCloseTo(47.26, 2);
    expect(result.periods[1]!.amount).toBeCloseTo(43.15, 2);
    expect(result.total).toBeCloseTo(90.41, 2);
  });

  it('ROK PRZESTĘPNY liczony po dniach rzeczywistych', () => {
    // 2028 jest przestępny: luty ma 29 dni, więc od 1.02 do 1.03 mija 29 dni.
    const result = calculateInterest({
      principal: 10000,
      from: '2028-02-01',
      to: '2028-03-01',
      kind: 'statutory_late',
    });
    expect(result.periods[0]!.days).toBe(29);
    // 10000 × 0,105 × 29/365 = 83,42
    expect(result.total).toBeCloseTo(83.42, 2);
  });

  it('jeden dzień opóźnienia', () => {
    const result = calculateInterest({
      principal: 36500,
      from: '2026-08-01',
      to: '2026-08-02',
      kind: 'statutory_late',
    });
    // 36500 × 0,105 × 1/365 = 10,50
    expect(result.total).toBeCloseTo(10.5, 2);
  });

  it('dzień płatności nie jest dniem opóźnienia', () => {
    expect(
      calculateInterest({
        principal: 4300,
        from: '2026-08-01',
        to: '2026-08-01',
        kind: 'statutory_late',
      }).total,
    ).toBe(0);
  });

  it('daty odwrócone i kwoty bez sensu dają zero, nie wyjątek', () => {
    // Wezwanie ma nie powstać, ale wyliczenie nie ma prawa wywalić karty.
    expect(
      calculateInterest({
        principal: 4300,
        from: '2026-09-01',
        to: '2026-08-01',
        kind: 'statutory_late',
      }).total,
    ).toBe(0);

    expect(
      calculateInterest({
        principal: -100,
        from: '2026-08-01',
        to: '2026-09-01',
        kind: 'statutory_late',
      }).total,
    ).toBe(0);

    expect(
      calculateInterest({
        principal: Number.NaN,
        from: '2026-08-01',
        to: '2026-09-01',
        kind: 'statutory_late',
      }).total,
    ).toBe(0);
  });

  it('okres przez DWIE zmiany stopy daje trzy podokresy', () => {
    const result = calculateInterest({
      principal: 10000,
      from: '2024-12-01',
      to: '2026-02-01',
      kind: 'commercial',
    });
    expect(result.periods).toHaveLength(3);
    expect(result.periods.map((p) => p.rate)).toEqual([0.165, 0.155, 0.145]);
  });

  it('suma podokresów równa się sumie całkowitej', () => {
    const result = calculateInterest({
      principal: 7777.77,
      from: '2024-06-15',
      to: '2026-03-20',
      kind: 'statutory_late',
    });
    const manual = result.periods.reduce((sum, p) => sum + p.amount, 0);
    expect(result.total).toBeCloseTo(manual, 2);
  });
});

describe('K-05 — kiedy w ogóle proponować', () => {
  it('poniżej progu opcja się nie pojawia', () => {
    // Wezwanie z odsetkami na osiemnaście groszy ośmiesza nadawcę.
    const result = calculateInterest({
      principal: 200,
      from: '2026-08-20',
      to: '2026-08-23',
      kind: 'statutory_late',
    });
    expect(result.total).toBeLessThan(MIN_INTEREST_PLN);
    expect(shouldOfferInterest({ total: result.total, clientOptedIn: true })).toBe(
      false,
    );
  });

  it('bez zgody klienta odsetek nie ma, choćby kwota była duża', () => {
    // Domyślnie WYŁĄCZONE: agent nie zaostrza tonu w cudzym imieniu.
    expect(shouldOfferInterest({ total: 5000, clientOptedIn: false })).toBe(false);
  });
});

describe('K-05 — rozliczenie dla kontrahenta', () => {
  it('pokazuje od–do, stawkę i kwotę', () => {
    // Kwota bez rozliczenia jest żądaniem; z rozliczeniem — wyliczeniem,
    // z którym da się dyskutować albo je przyjąć.
    const result = calculateInterest({
      principal: 10000,
      from: '2025-12-17',
      to: '2026-01-16',
      kind: 'statutory_late',
    });
    const lines = formatInterestBreakdown(result);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('2025-12-17');
    expect(lines[0]).toContain('11.5%');
    expect(lines[0]).toContain('47.26');
  });
});
