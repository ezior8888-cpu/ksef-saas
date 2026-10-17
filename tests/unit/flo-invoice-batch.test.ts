import { describe, expect, it } from 'vitest';

import {
  buildBatchItems,
  buildBatchProposal,
  buildMissingInvoiceProposal,
  filterStillNeeded,
  MAX_BATCH,
  MISSING_AFTER_DAYS,
  shouldAskAboutMissing,
  type DraftCandidate,
  type MissingInvoiceInput,
} from '@/lib/flo/functions/invoice-batch';

/**
 * P-02 paczka szkiców (krok 32) i P-03 brakująca faktura (krok 33).
 *
 * P-02 ma największy promień rażenia w grupie przychodowej: hurtowa wysyłka
 * do rejestru państwowego jest nieodwracalna.
 */

const NOW = new Date('2026-09-01T08:00:00.000Z');

function candidate(overrides: Partial<DraftCandidate> = {}): DraftCandidate {
  return {
    profileId: 'p1',
    contractorId: 'c1',
    contractorName: 'ACME Sp. z o.o.',
    amount: 22140,
    typicalAmount: 22140,
    paymentTermDays: 14,
    alreadyInvoicedThisPeriod: false,
    ...overrides,
  };
}

describe('P-02 — pozycje odstające', () => {
  it('AWARIA 1: kwota odbiegająca od zwykłej jest ODZNACZONA', () => {
    // Stawka wzrosła albo zakres prac był inny. Klient zaznaczający wszystko
    // hurtem wysłałby fakturę na złą kwotę do rejestru państwowego.
    const [item] = buildBatchItems([
      candidate({ amount: 45000, typicalAmount: 22140 }),
    ]);

    expect(item!.preselected).toBe(false);
    expect(item!.needsPreview).toBe(true);
    expect(item!.sublabel).toContain('otwórz i sprawdź');
  });

  it('typowa kwota przechodzi bez tarcia', () => {
    const [item] = buildBatchItems([candidate()]);
    expect(item!.preselected).toBe(true);
    expect(item!.needsPreview).toBe(false);
  });

  it('drobne wahanie nie blokuje', () => {
    // Wymaganie identycznej kwoty co miesiąc sprawiłoby, że funkcja nie
    // działa u nikogo, kto rozlicza się godzinowo.
    const [item] = buildBatchItems([
      candidate({ amount: 23000, typicalAmount: 22140 }),
    ]);
    expect(item!.preselected).toBe(true);
  });

  it('podpis pod odstającą pozycją mówi, ile było zwykle', () => {
    const [item] = buildBatchItems([
      candidate({ amount: 45000, typicalAmount: 22140 }),
    ]);
    expect(item!.outlierReason).toContain('22 140,00 zł');
  });
});

describe('P-02 — duplikat okresu', () => {
  it('AWARIA 2: faktura już wystawiona NIE trafia do paczki w ogóle', () => {
    // Pokazanie jej jako odznaczonej pozycji kusiłoby do zaznaczenia
    // „skoro tu jest, to pewnie trzeba" — a to dwie faktury za tę samą usługę.
    const items = buildBatchItems([
      candidate({ alreadyInvoicedThisPeriod: true }),
      candidate({ profileId: 'p2', contractorId: 'c2' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('p2');
  });

  it('druga warstwa: sprawdzenie przy kliknięciu', () => {
    // Między zbudowaniem paczki a kliknięciem mija zwykle kilka godzin,
    // w których klient mógł wystawić fakturę ręcznie.
    const items = buildBatchItems([
      candidate({ profileId: 'p1', contractorId: 'c1' }),
      candidate({ profileId: 'p2', contractorId: 'c2' }),
    ]);

    const { send, skipped } = filterStillNeeded(items, new Set(['c1']));

    expect(send.map((i) => i.id)).toEqual(['p2']);
    expect(skipped.map((i) => i.id)).toEqual(['p1']);
  });
});

describe('P-02 — limit i numeracja', () => {
  it('nie więcej niż dziesięć pozycji w paczce', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      candidate({ profileId: `p${i}`, contractorId: `c${i}` }),
    );
    expect(buildBatchItems(many)).toHaveLength(MAX_BATCH);
  });

  it('AWARIA 3: szkic NIE dostaje numeru', () => {
    // Numery rezerwowane z wyprzedzeniem zostawiają dziury po odrzuconych
    // szkicach — awarię widać dopiero przy pytaniu księgowej, dlaczego
    // brakuje faktury numer 14.
    const proposal = buildBatchProposal({
      tenantId: 'ten-1',
      items: buildBatchItems([candidate()]),
      periodKey: '2026-09',
      now: NOW,
    })!;

    expect(proposal.payload?.numbersAssignedAtSend).toBe(true);
    expect(proposal.body).toContain('Numery nadam dopiero przy wysyłce');
    expect(JSON.stringify(proposal.payload)).not.toMatch(/"number"|"internalNumber"/);
  });

  it('karta mówi, ile pozycji wymaga obejrzenia', () => {
    const proposal = buildBatchProposal({
      tenantId: 'ten-1',
      items: buildBatchItems([
        candidate(),
        candidate({ profileId: 'p2', contractorId: 'c2', amount: 90000 }),
      ]),
      periodKey: '2026-09',
      now: NOW,
    })!;
    expect(proposal.body).toContain('odbiega');
    expect(proposal.body).toContain('odznaczone');
  });

  it('pusta paczka to brak karty', () => {
    expect(
      buildBatchProposal({
        tenantId: 'ten-1',
        items: [],
        periodKey: '2026-09',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('szkice tracą ważność po tygodniu', () => {
    const proposal = buildBatchProposal({
      tenantId: 'ten-1',
      items: buildBatchItems([candidate()]),
      periodKey: '2026-09',
      now: NOW,
    })!;
    const days = (proposal.expiresAt.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(7);
  });
});

// ═══════════════════════════════════════════════════════════════
// P-03
// ═══════════════════════════════════════════════════════════════

function missing(overrides: Partial<MissingInvoiceInput> = {}): MissingInvoiceInput {
  return {
    profileId: 'p1',
    contractorName: 'Kamil Nowak',
    typicalDayOfMonth: 10,
    typicalAmount: 4300,
    endedAskedBefore: false,
    elsewhereStreak: 0,
    ...overrides,
  };
}

describe('P-03 — kiedy pytać', () => {
  it('nie pyta za wcześnie', () => {
    // Faktura bywa wystawiana z poślizgiem. Pytanie następnego dnia po
    // typowym terminie to nagabywanie.
    expect(shouldAskAboutMissing(missing(), 3)).toMatchObject({
      kind: 'silent',
      reason: 'too_early',
    });
  });

  it('pyta po tygodniu', () => {
    expect(shouldAskAboutMissing(missing(), MISSING_AFTER_DAYS).kind).toBe(
      'ask_ended',
    );
  });

  it('AWARIA: pytanie o koniec współpracy pada RAZ w życiu profilu', () => {
    // Agent przypominający co miesiąc o straconym kliencie to najgorszy
    // możliwy sposób na zaczynanie dnia.
    expect(
      shouldAskAboutMissing(missing({ endedAskedBefore: true }), 20),
    ).toMatchObject({ kind: 'silent', reason: 'already_asked' });
  });

  it('AWARIA: dwa razy „wystawiam gdzie indziej" i agent milknie', () => {
    // To jest odpowiedź, nie zbieg okoliczności. Klient fakturuje tę firmę
    // w innym programie i nie ma powodu tłumaczyć się z tego co miesiąc.
    expect(
      shouldAskAboutMissing(missing({ elsewhereStreak: 2 }), 30),
    ).toMatchObject({ kind: 'silent', reason: 'invoices_elsewhere' });
  });
});

describe('P-03 — treść i kanał', () => {
  it('NIGDY nie mówi „zapomniałeś"', () => {
    // Posądzanie o niekompetencję przez program, który po prostu nie wie
    // wszystkiego, jest szczególnie drażliwe u kogoś, kto dopiero zaczyna.
    const proposal = buildMissingInvoiceProposal({
      tenantId: 'ten-1',
      missing: missing(),
      daysAfterTypical: 10,
      now: NOW,
    })!;

    expect(proposal.body).not.toMatch(/zapomnia|przeoczy|zaniedba/i);
    expect(proposal.body).toContain('Wystawiłeś ją gdzie indziej?');
  });

  it('daje trzeci przycisk zamiast wyboru między dwoma nieprawdami', () => {
    const proposal = buildMissingInvoiceProposal({
      tenantId: 'ten-1',
      missing: missing(),
      daysAfterTypical: 10,
      now: NOW,
    })!;

    const labels = (proposal.payload?.secondary as Array<{ label: string }>).map(
      (a) => a.label,
    );
    expect(labels).toContain('Wystawiona poza FaktFlow');
    expect(labels).toContain('Skończyliśmy współpracę');
  });

  it('NIE MA PRAWA do powiadomienia push', () => {
    // Przypomnienie o cudzej decyzji biznesowej, które dzwoni w telefonie
    // podczas urlopu, to nie pomoc, tylko natręctwo.
    const proposal = buildMissingInvoiceProposal({
      tenantId: 'ten-1',
      missing: missing(),
      daysAfterTypical: 10,
      now: NOW,
    })!;
    expect(proposal.payload?.noPush).toBe(true);
  });

  it('klucz tematu nie zawiera okresu — pytanie ma paść raz', () => {
    const a = buildMissingInvoiceProposal({
      tenantId: 'ten-1',
      missing: missing(),
      daysAfterTypical: 10,
      now: NOW,
    })!;
    const b = buildMissingInvoiceProposal({
      tenantId: 'ten-1',
      missing: missing(),
      daysAfterTypical: 40,
      now: new Date('2026-10-01T08:00:00.000Z'),
    })!;
    expect(a.topicKey).toBe(b.topicKey);
  });

  it('przy milczeniu nie ma karty', () => {
    expect(
      buildMissingInvoiceProposal({
        tenantId: 'ten-1',
        missing: missing({ elsewhereStreak: 2 }),
        daysAfterTypical: 30,
        now: NOW,
      }),
    ).toBeNull();
  });
});
