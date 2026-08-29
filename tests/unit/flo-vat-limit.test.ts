import { describe, expect, it } from 'vitest';

import {
  buildVatLimitProposal,
  crossedThreshold,
  EXCEEDED,
  forecast,
  proratedLimit,
  THRESHOLDS,
  vatLimitState,
  type SalesEntry,
  type VatLimitInput,
} from '@/lib/flo/functions/vat-limit';
import { formatPln } from '@/lib/flo/money';

/**
 * T-02 — licznik limitu zwolnienia z VAT (krok 37).
 *
 * Złoty zbiór z planu: firma od 1 stycznia, firma od 17 sierpnia, firma
 * zawieszona, sprzedaż zwolniona przedmiotowo.
 */

const LIMIT = 200_000;
const d = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

function sale(net: number, date: string, extra: Partial<SalesEntry> = {}): SalesEntry {
  return { net, date, ...extra };
}

function input(overrides: Partial<VatLimitInput> = {}): VatLimitInput {
  return {
    year: 2026,
    limit: LIMIT,
    startedOn: '2020-01-01',
    sales: [],
    today: d('2026-07-01'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// ZŁOTY ZBIÓR
// ═══════════════════════════════════════════════════════════════

describe('złoty zbiór — firma od 1 stycznia', () => {
  it('limit jest pełny, bez proporcji', () => {
    const state = vatLimitState(input({ startedOn: '2026-01-01' }));
    expect(state.effectiveLimit).toBe(LIMIT);
    expect(state.prorated).toBe(false);
    expect(state.activeDays).toBe(365);
  });

  it('firma prowadzona od lat też ma pełny limit', () => {
    expect(vatLimitState(input()).effectiveLimit).toBe(LIMIT);
  });
});

describe('złoty zbiór — firma od 17 sierpnia', () => {
  const started = input({ startedOn: '2026-08-17', today: d('2026-10-01') });

  it('limit jest proporcjonalny do dni działalności', () => {
    // 17.08–31.12 to 137 dni; 200 000 × 137/365.
    const { limit, activeDays, prorated } = proratedLimit({
      limit: LIMIT,
      year: 2026,
      startedOn: '2026-08-17',
    });
    expect(activeDays).toBe(137);
    expect(prorated).toBe(true);
    expect(limit).toBe(75_068.49);
  });

  it('wzór pokazuje proporcję, a nie samą liczbę', () => {
    // Licznik bez wzoru to wyrocznia — klient ma prawo zobaczyć,
    // skąd wziął się jego limit.
    const state = vatLimitState(started);
    expect(state.formula).toContain('137/365 dni');
    expect(state.formula).toContain('200 000,00 zł');
    expect(state.formula).toContain('75 068,49 zł');
  });

  it('rok przestępny ma 366 dni', () => {
    expect(proratedLimit({ limit: LIMIT, year: 2028, startedOn: '2028-01-01' }).daysInYear).toBe(
      366,
    );
  });

  it('ta sama sprzedaż zjada u nowej firmy dużo większą część limitu', () => {
    const sales = [sale(50_000, '2026-09-01')];
    const fresh = vatLimitState(input({ startedOn: '2026-08-17', sales, today: d('2026-10-01') }));
    const old = vatLimitState(input({ sales, today: d('2026-10-01') }));

    expect(Math.floor(fresh.pct)).toBe(66);
    expect(Math.floor(old.pct)).toBe(25);
  });
});

describe('złoty zbiór — firma zawieszona', () => {
  it('zawieszenie NIE zmniejsza limitu', () => {
    // Limit jest roczny i zależy od daty rozpoczęcia, nie od tego, ile
    // miesięcy klient faktycznie pracował.
    const state = vatLimitState(input({ suspendedDays: 120, sales: [sale(60_000, '2026-02-01')] }));
    expect(state.effectiveLimit).toBe(LIMIT);
  });

  it('zawieszenie wypada z mianownika tempa', () => {
    // Firma zawieszona przez pół roku nie ma zerowego tempa — nie miała
    // kiedy sprzedawać. Wliczenie tych dni zaniżyłoby tempo i przesunęło
    // ostrzeżenie na po fakcie.
    const sales = [sale(60_000, '2026-02-01')];
    const active = input({ sales, today: d('2026-07-01') });
    const suspended = input({ sales, today: d('2026-07-01'), suspendedDays: 90 });

    const paceActive = forecast(active, vatLimitState(active)).perDay;
    const paceSuspended = forecast(suspended, vatLimitState(suspended)).perDay;

    expect(paceSuspended).toBeGreaterThan(paceActive);
  });
});

describe('złoty zbiór — sprzedaż zwolniona przedmiotowo', () => {
  const sales = [
    sale(90_000, '2026-03-01'),
    sale(40_000, '2026-04-01', {
      countsToLimit: false,
      excludedReason: 'usługa zwolniona przedmiotowo',
    }),
  ];

  it('wyłączona sprzedaż nie podbija licznika', () => {
    const state = vatLimitState(input({ sales }));
    expect(state.used).toBe(90_000);
    expect(state.excluded).toBe(40_000);
  });

  it('powód wyłączenia jest widoczny, nie schowany', () => {
    const state = vatLimitState(input({ sales }));
    expect(state.exclusions[0]).toContain('usługa zwolniona przedmiotowo');
    expect(state.exclusions[0]).toContain('40 000,00 zł');

    const proposal = buildVatLimitProposal({
      tenantId: 't1',
      input: input({ sales }),
      state,
      threshold: 60,
      forecast: forecast(input({ sales }), state),
    });
    expect(proposal.evidence?.some((e) => e.label.includes('Poza limitem'))).toBe(true);
  });

  it('BRAK JAWNEGO WYŁĄCZENIA ZNACZY: WLICZAMY', () => {
    // Kierunek domyślnej pomyłki wybrany świadomie. Policzenie za dużo
    // kończy się niepotrzebnym ostrzeżeniem; policzenie za mało —
    // przekroczeniem limitu, o którym klient dowiaduje się od urzędu.
    const state = vatLimitState(input({ sales: [sale(10_000, '2026-03-01')] }));
    expect(state.used).toBe(10_000);
    expect(state.excluded).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Progi
// ═══════════════════════════════════════════════════════════════

describe('progi 60 / 80 / 90 i przekroczenie', () => {
  it('rozpoznaje przekroczony próg', () => {
    expect(crossedThreshold(55, 62)).toBe(60);
    expect(crossedThreshold(78, 81)).toBe(80);
    expect(crossedThreshold(88, 93)).toBe(90);
  });

  it('nie powtarza progu, który już padł', () => {
    expect(crossedThreshold(62, 70)).toBeNull();
  });

  it('jedna faktura przez kilka progów daje JEDNĄ kartę, tę najwyższą', () => {
    // Trzy karty za jedną fakturę to nie ostrzeżenie, tylko hałas.
    expect(crossedThreshold(55, 95)).toBe(90);
  });

  it('przekroczenie limitu jest osobnym zdarzeniem', () => {
    expect(crossedThreshold(95, 101)).toBe(EXCEEDED);
    expect(crossedThreshold(40, 130)).toBe(EXCEEDED);
  });

  it('progi z planu, w tej kolejności', () => {
    expect([...THRESHOLDS]).toEqual([60, 80, 90]);
  });

  it('przeliczenie idzie PO KAŻDEJ FAKTURZE, nie raz na dobę', () => {
    // Dwie faktury tego samego dnia przekraczają dwa różne progi. Przy
    // przebiegu dobowym klient zobaczyłby jedną kartę nazajutrz — po
    // wystawieniu kolejnych.
    const before = vatLimitState(input({ sales: [sale(150_000, '2026-06-01')] }));
    const afterFirst = vatLimitState(
      input({ sales: [sale(150_000, '2026-06-01'), sale(15_000, '2026-06-02')] }),
    );
    const afterSecond = vatLimitState(
      input({
        sales: [
          sale(150_000, '2026-06-01'),
          sale(15_000, '2026-06-02'),
          sale(20_000, '2026-06-02'),
        ],
      }),
    );

    expect(crossedThreshold(before.pct, afterFirst.pct)).toBe(80);
    expect(crossedThreshold(afterFirst.pct, afterSecond.pct)).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════
// Prognoza
// ═══════════════════════════════════════════════════════════════

describe('prognoza jako scenariusz', () => {
  const sales = [sale(100_000, '2026-01-15'), sale(20_000, '2026-06-01')];
  const args = input({ sales, startedOn: '2026-01-01', today: d('2026-07-01') });

  it('podaje dzień przekroczenia przy utrzymanym tempie', () => {
    const f = forecast(args, vatLimitState(args));
    expect(f.crossesOn).not.toBeNull();
    expect(f.perDay).toBeGreaterThan(0);
  });

  it('„jeśli tempo się utrzyma” pada w treści', () => {
    const state = vatLimitState(args);
    const proposal = buildVatLimitProposal({
      tenantId: 't1',
      input: args,
      state,
      threshold: 60,
      forecast: forecast(args, state),
    });
    expect(proposal.body).toContain('Jeśli tempo się utrzyma');
  });

  it('jednorazowy kontrakt zmienia PROGNOZĘ', () => {
    const state = vatLimitState(args);
    const normal = forecast(args, state);
    const corrected = forecast(args, state, { ignoreLargestSale: true });

    expect(corrected.perDay).toBeLessThan(normal.perDay);
    expect(corrected.crossesOn === null || corrected.crossesOn > normal.crossesOn!).toBe(true);
  });

  it('jednorazowy kontrakt NIE ZMIENIA LICZNIKA', () => {
    // Jednorazowość kontraktu nie sprawia, że pieniądze nie wpłynęły.
    const state = vatLimitState(args);
    forecast(args, state, { ignoreLargestSale: true });
    expect(state.used).toBe(120_000);
    expect(vatLimitState(args).used).toBe(120_000);
  });

  it('spokojne tempo kończy się wprost: nie przekroczysz', () => {
    const calm = input({
      sales: [sale(5_000, '2026-01-15')],
      startedOn: '2026-01-01',
      today: d('2026-07-01'),
    });
    const f = forecast(calm, vatLimitState(calm));
    expect(f.beyondYear).toBe(true);
    expect(f.crossesOn).toBeNull();
  });

  it('bez sprzedaży nie ma prognozy', () => {
    const empty = input({ startedOn: '2026-01-01' });
    expect(forecast(empty, vatLimitState(empty)).crossesOn).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

describe('karta T-02', () => {
  const sales = [sale(130_000, '2026-03-01')];
  const args = input({ sales, startedOn: '2026-01-01', today: d('2026-07-01') });
  const state = vatLimitState(args);
  const proposal = buildVatLimitProposal({
    tenantId: 't1',
    input: args,
    state,
    threshold: 60,
    forecast: forecast(args, state),
  });

  it('mówi, ile zostało, nie ile wydano', () => {
    expect(proposal.title).toContain(formatPln(70_000));
  });

  it('każdy próg ogłaszany raz w roku', () => {
    // Bez tego karta wracałaby po każdej fakturze przy 61, 62, 63 procentach.
    expect(proposal.topicKey).toBe('tax.limit:2026:60');
  });

  it('wzór jest w dowodach, nie na osobnym ekranie', () => {
    expect(proposal.evidence?.[0]?.label).toBe(state.formula);
  });

  it('przycisk „to był jednorazowy kontrakt” POPRAWIA FAKT, nie odrzuca karty', () => {
    // Gdyby siedział na `dismiss`, dwa poprawienia agenta wyciszyłyby
    // rodzaj na 90 dni — czyli poprawianie kończyłoby się zamilknięciem.
    const secondary = proposal.payload?.secondary as { label: string; intent: string }[];
    const oneOff = secondary.find((a) => a.label.includes('jednorazowy'));
    expect(oneOff?.intent).toBe('correct');
    expect(proposal.payload?.correction).toBe('ignore_largest_sale');
  });

  it('agent nie rejestruje nikogo do VAT-u', () => {
    expect(proposal.payload?.primaryIntent).toBe('open');
    expect(JSON.stringify(proposal)).not.toMatch(/zarejestruj/i);
  });

  it('licznik żyje do końca roku', () => {
    expect(proposal.expiresAt.toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});

describe('karta przy przekroczeniu limitu', () => {
  const sales = [sale(210_000, '2026-03-01')];
  const args = input({ sales, startedOn: '2026-01-01', today: d('2026-07-01') });
  const state = vatLimitState(args);
  const proposal = buildVatLimitProposal({
    tenantId: 't1',
    input: args,
    state,
    threshold: EXCEEDED,
    forecast: forecast(args, state),
  });

  it('to sprawa natychmiastowa — na górze wątku', () => {
    expect(proposal.priority).toBe(0);
  });

  it('mówi wprost, od kiedy obowiązuje VAT', () => {
    // Obowiązek biegnie od transakcji, która przekroczyła limit — klient,
    // który dowiaduje się o tym po fakcie, ma problem wsteczny.
    expect(proposal.body).toContain('Od transakcji, która przekroczyła limit');
    expect(proposal.body).toContain('Pokaż to księgowej');
  });

  it('nie proponuje prognozy ani poprawiania faktów', () => {
    const secondary = proposal.payload?.secondary as { intent: string }[];
    expect(secondary.some((a) => a.intent === 'correct')).toBe(false);
  });

  it('licznik nie schodzi poniżej zera', () => {
    expect(state.remaining).toBe(0);
    expect(state.pct).toBeGreaterThan(100);
  });
});
