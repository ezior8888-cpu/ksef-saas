import { describe, expect, it } from 'vitest';

import {
  buildMilestoneProposal,
  decideMilestone,
  eligibleInvoices,
  eligibleTotal,
  FIRST_MONTH_DAYS,
  MILESTONES,
  SETTLE_DELAY_DAYS,
  type MilestoneInput,
  type PaidInvoice,
} from '@/lib/flo/functions/milestone';
import { formatPln } from '@/lib/flo/money';

/**
 * S-04 — progi pieniężne (krok 51).
 *
 * Definicja gotowości z planu: KONTO Z HISTORIĄ Z IMPORTU NIE DOSTAJE
 * PROGÓW WSTECZ.
 */

const TODAY = new Date('2026-09-16T09:00:00.000Z');
const REGISTERED = '2026-01-10';

/** Wpłata sprzed dwóch tygodni — po siedmiodniowej karencji. */
const SETTLED_AT = '2026-09-01T10:00:00.000Z';

function invoice(overrides: Partial<PaidInvoice> = {}): PaidInvoice {
  return {
    id: 'inv-1',
    gross: 12_300,
    paidAt: SETTLED_AT,
    corrected: false,
    origin: 'app',
    ...overrides,
  };
}

function input(overrides: Partial<MilestoneInput> = {}): MilestoneInput {
  return {
    registeredAt: REGISTERED,
    invoices: [invoice()],
    awarded: [],
    hasUrgentOpen: false,
    today: TODAY,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEFINICJA GOTOWOŚCI — import nie odblokowuje progów wstecz
// ═══════════════════════════════════════════════════════════════

describe('konto z historią z importu nie dostaje progów wstecz', () => {
  it('faktury z importu NIE LICZĄ SIĘ do progów', () => {
    // Powinszowanie „pierwszych 10 000 zł" w dniu, w którym klient
    // zaimportował trzy lata faktur, jest dowodem, że program nie rozumie,
    // z kim rozmawia.
    const imported = input({
      invoices: [
        invoice({ id: 'i1', gross: 40_000, origin: 'ksef_import' }),
        invoice({ id: 'i2', gross: 30_000, origin: 'file_import' }),
      ],
    });
    expect(eligibleTotal(imported)).toBe(0);
    expect(decideMilestone(imported)).toEqual({
      kind: 'silent',
      reason: 'nothing_reached',
    });
  });

  it('wpłata sprzed rejestracji konta też nie liczy się', () => {
    const older = input({
      invoices: [invoice({ paidAt: '2025-11-02T10:00:00.000Z' })],
    });
    expect(eligibleInvoices(older)).toHaveLength(0);
  });

  it('KONTO, KTÓRE W PIERWSZYM MIESIĄCU PRZEBIJA NAJWYŻSZY PRÓG, NIE DOSTAJE ŻADNEGO', () => {
    // To nie jest ktoś, kto właśnie zaczyna, tylko firma, która się do nas
    // przeprowadziła.
    const established = input({
      registeredAt: '2026-09-01',
      invoices: [invoice({ gross: 150_000, paidAt: '2026-09-03T10:00:00.000Z' })],
    });

    const verdict = decideMilestone(established);
    expect(verdict.kind).toBe('suppress_all');
    if (verdict.kind !== 'suppress_all') return;
    expect(verdict.keys).toHaveLength(MILESTONES.length);
    expect(buildMilestoneProposal({ tenantId: 't1', milestone: established })).toBeNull();
  });

  it('to samo konto po pierwszym miesiącu już normalnie zbiera progi', () => {
    const later = input({
      registeredAt: '2026-01-10',
      invoices: [invoice({ gross: 150_000 })],
      today: new Date(
        Date.parse('2026-01-10T00:00:00.000Z') + (FIRST_MONTH_DAYS + 5) * 86_400_000,
      ),
    });
    // Wpłata musi być starsza niż karencja.
    const verdict = decideMilestone({
      ...later,
      invoices: [invoice({ gross: 150_000, paidAt: '2026-01-20T10:00:00.000Z' })],
    });
    expect(verdict.kind).toBe('award');
  });
});

// ═══════════════════════════════════════════════════════════════
// Karencja i korekty
// ═══════════════════════════════════════════════════════════════

describe('opłacone, nieskorygowane, po siedmiu dniach', () => {
  it('świeża wpłata jeszcze się nie liczy', () => {
    // Wpłata bywa cofana, a próg przyznany i po tygodniu nieprawdziwy jest
    // gorszy niż brak progu — bo odebrać go nie wolno.
    const fresh = input({
      invoices: [
        invoice({
          paidAt: new Date(TODAY.getTime() - 2 * 86_400_000).toISOString(),
        }),
      ],
    });
    expect(eligibleInvoices(fresh)).toHaveLength(0);
  });

  it('po karencji już tak', () => {
    const settled = input({
      invoices: [
        invoice({
          paidAt: new Date(
            TODAY.getTime() - (SETTLE_DELAY_DAYS + 1) * 86_400_000,
          ).toISOString(),
        }),
      ],
    });
    expect(eligibleInvoices(settled)).toHaveLength(1);
  });

  it('faktura skorygowana wypada z licznika', () => {
    expect(
      eligibleInvoices(input({ invoices: [invoice({ corrected: true })] })),
    ).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Progi
// ═══════════════════════════════════════════════════════════════

describe('cztery progi', () => {
  it('pierwsza opłacona faktura', () => {
    const verdict = decideMilestone(
      input({ invoices: [invoice({ gross: 500 })] }),
    );
    expect(verdict.kind).toBe('award');
    if (verdict.kind !== 'award') return;
    expect(verdict.milestone.key).toBe('first_paid');
  });

  it('przy kilku progach naraz przyznajemy NAJWYŻSZY', () => {
    // Trzy karty jednego dnia zamieniłyby miły moment w spam.
    const verdict = decideMilestone(
      input({ invoices: [invoice({ gross: 60_000 })] }),
    );
    expect(verdict.kind).toBe('award');
    if (verdict.kind !== 'award') return;
    expect(verdict.milestone.key).toBe('pln_50k');
  });

  it('próg raz przyznany nie wraca', () => {
    const verdict = decideMilestone(
      input({ invoices: [invoice({ gross: 500 })], awarded: ['first_paid'] }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'already_awarded' });
  });

  it('kolejny próg przychodzi mimo poprzednich', () => {
    const verdict = decideMilestone(
      input({
        invoices: [invoice({ gross: 12_000 })],
        awarded: ['first_paid'],
      }),
    );
    expect(verdict.kind).toBe('award');
    if (verdict.kind !== 'award') return;
    expect(verdict.milestone.key).toBe('pln_10k');
  });
});

// ═══════════════════════════════════════════════════════════════
// Ton i miejsce w wątku
// ═══════════════════════════════════════════════════════════════

describe('ton — wyłącznie kwoty', () => {
  const proposal = buildMilestoneProposal({
    tenantId: 't1',
    milestone: input({ invoices: [invoice({ gross: 12_000 })] }),
  })!;

  it('BEZ „gratulacje", bez odznak, bez licznika faktur', () => {
    // Setna faktura nie jest osiągnięciem — jest miarą tego, ile razy klient
    // użył programu, czyli pochwałą dla nas, nie dla niego.
    const text = `${proposal.title} ${proposal.body} ${JSON.stringify(proposal.payload)}`;
    expect(text).not.toMatch(/gratulacj|brawo|odznak|poziom|osiągnął|setn/i);
    expect(text).not.toMatch(/liczba faktur|invoiceCount/i);
  });

  it('kwota jest jedyną liczbą na karcie', () => {
    expect(proposal.payload?.amount).toBe(formatPln(12_000));
  });

  it('NIGDY POWIADOMIENIE i najniższy priorytet w wątku', () => {
    expect(proposal.payload?.noPush).toBe(true);
    expect(proposal.priority).toBe(99);
  });

  it('przy otwartej sprawie pilnej próg CZEKA', () => {
    // Dobra wiadomość, która przepycha się przed niezapłaconą fakturę,
    // przestaje być dobrą wiadomością.
    expect(
      decideMilestone(input({ invoices: [invoice({ gross: 12_000 })], hasUrgentOpen: true })),
    ).toEqual({ kind: 'silent', reason: 'urgent_open' });
  });

  it('jeden próg = jedna karta w życiu konta', () => {
    expect(proposal.topicKey).toBe('milestone.money:pln_10k');
  });
});
