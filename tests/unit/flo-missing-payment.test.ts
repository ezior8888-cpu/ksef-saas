import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildMissingDocsProposal,
  detectRecurringCycles,
  findMissingThisMonth,
  MAX_SHOWN,
  sellersToForget,
  type ExpenseRecord,
} from '@/lib/flo/functions/expense-missing';
import {
  buildPaymentConfirmProposal,
  classifyConfirmation,
  selectOverdueForConfirmation,
  SNOOZE_DAYS,
  type OverdueInvoice,
} from '@/lib/flo/functions/payment-confirm';

/**
 * W-04 łowca zapomnianych kosztów (krok 21) i K-01 potwierdzanie wpłat
 * (krok 22).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// W-04
// ═══════════════════════════════════════════════════════════════

function expense(month: string, amount: number, seller = 'OVH'): ExpenseRecord {
  return {
    id: `${seller}-${month}`,
    sellerName: seller,
    grossAmount: amount,
    issueDate: `${month}-05`,
  };
}

describe('W-04 — wykrywanie cykli', () => {
  it('trzy miesiące z podobną kwotą to cykl', () => {
    const cycles = detectRecurringCycles([
      expense('2026-05', 49),
      expense('2026-06', 49),
      expense('2026-07', 49),
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.typicalAmount).toBe(49);
  });

  it('trzy dokumenty z jednego miesiąca to nie rytm', () => {
    // To są trzy zakupy, nie abonament.
    const cycles = detectRecurringCycles([
      { id: 'a', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-07-01' },
      { id: 'b', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-07-10' },
      { id: 'c', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-07-20' },
    ]);
    expect(cycles).toHaveLength(0);
  });

  it('skaczące kwoty to nie cykl', () => {
    // Sprzedawca, u którego raz jest 50 zł, a raz 5000, nie ma rytmu —
    // ma po prostu dużo zakupów.
    const cycles = detectRecurringCycles([
      expense('2026-05', 50),
      expense('2026-06', 5000),
      expense('2026-07', 300),
    ]);
    expect(cycles).toHaveLength(0);
  });
});

describe('W-04 — brakujące dokumenty', () => {
  const cycles = detectRecurringCycles([
    expense('2026-05', 49),
    expense('2026-06', 49),
    expense('2026-07', 49),
  ]);

  it('znajduje brak w bieżącym miesiącu', () => {
    const missing = findMissingThisMonth(cycles, NOW);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.sellerName).toBe('OVH');
  });

  it('nie pyta na początku miesiąca', () => {
    // Faktura za hosting potrafi przyjść piątego. Pytanie pierwszego byłoby
    // nagabywaniem o coś, co jest w drodze.
    const earlyMonth = new Date('2026-08-03T12:00:00.000Z');
    expect(findMissingThisMonth(cycles, earlyMonth)).toHaveLength(0);
  });

  it('milczy, gdy dokument już jest', () => {
    const withCurrent = detectRecurringCycles([
      expense('2026-06', 49),
      expense('2026-07', 49),
      expense('2026-08', 49),
    ]);
    expect(findMissingThisMonth(withCurrent, NOW)).toHaveLength(0);
  });
});

describe('W-04 — karta', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    sellerName: `Dostawca ${i}`,
    typicalAmount: 100 * (i + 1),
    month: '2026-08',
  }));

  it('pokazuje najwyżej trzy pozycje, resztę zwija', () => {
    // Lista sześciu braków to lista zarzutów, nie pomoc.
    const proposal = buildMissingDocsProposal({
      tenantId: 'ten-1',
      missing: many,
      month: '2026-08',
      now: NOW,
    })!;

    expect(proposal.payload?.hiddenCount).toBe(many.length - MAX_SHOWN);
    expect(proposal.body).toContain('i jeszcze 3 podobnych');
  });

  it('MÓWI O DOKUMENCIE, nigdy o dopisaniu kwoty', () => {
    // Najważniejsza asercja tej funkcji. „Brakuje kosztu — dodać?" czyta się
    // jak propozycja dorobienia dokumentu, czyli zachęta do zaniżenia podatku.
    const proposal = buildMissingDocsProposal({
      tenantId: 'ten-1',
      missing: many.slice(0, 1),
      month: '2026-08',
      now: NOW,
    })!;

    expect(proposal.body).toContain('nie widzę dokumentu');
    expect(proposal.body).toMatch(/zgubił się/);
    expect(proposal.body).not.toMatch(/dodać|dopisać|utworzyć koszt/i);
    expect(proposal.payload?.primaryLabel).toBe('Wgraj dokument');
  });

  it('brak braków to brak karty', () => {
    expect(
      buildMissingDocsProposal({
        tenantId: 'ten-1',
        missing: [],
        month: '2026-08',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('„już tego nie mam" zwraca sprzedawców do zapomnienia', () => {
    const proposal = buildMissingDocsProposal({
      tenantId: 'ten-1',
      missing: many.slice(0, 2),
      month: '2026-08',
      now: NOW,
    })!;
    expect(sellersToForget(proposal.payload ?? {})).toEqual([
      'Dostawca 0',
      'Dostawca 1',
    ]);
  });
});

describe('W-04 — zakaz tworzenia kosztu bez dokumentu', () => {
  it('moduł nie ma ŻADNEJ ścieżki tworzącej wydatek', () => {
    // Wymóg z planu, sprawdzany na źródle. Gdyby ktoś kiedyś dopisał tu
    // wygodne „utwórz koszt z typowej kwoty", mielibyśmy w produkcie funkcję
    // zachęcającą do zaniżania podatku — i to my bylibyśmy jej autorem.
    const source = readFileSync(
      new URL('../../lib/flo/functions/expense-missing.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from\(['"]expenses['"]\)/);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toContain('createAdminClient');
  });
});

// ═══════════════════════════════════════════════════════════════
// K-01
// ═══════════════════════════════════════════════════════════════

function invoice(overrides: Partial<OverdueInvoice> = {}): OverdueInvoice {
  return {
    id: 'inv-1',
    number: '5/2026',
    contractorName: 'Nowak Sp. z o.o.',
    grossTotal: 4300,
    paidAmount: 0,
    dueDate: '2026-08-16',
    remindersPaused: false,
    ...overrides,
  };
}

describe('K-01 — kiedy pytamy', () => {
  it('AWARIA: nie pytamy w dniu terminu ani dzień wcześniej', () => {
    // „Przecież widzę, że wpłynęło" — agent wypytujący o rzeczy, które klient
    // ma pod kontrolą, traktuje go jak niekompetentnego.
    const dueToday = invoice({ dueDate: '2026-08-26' });
    expect(selectOverdueForConfirmation([dueToday], NOW)).toHaveLength(0);
  });

  it('pytamy dobę po terminie', () => {
    const yesterday = invoice({ dueDate: '2026-08-25' });
    expect(selectOverdueForConfirmation([yesterday], NOW)).toHaveLength(1);
  });

  it('nie pytamy o zapłacone ani o wstrzymane', () => {
    expect(
      selectOverdueForConfirmation([invoice({ paidAmount: 4300 })], NOW),
    ).toHaveLength(0);
    expect(
      selectOverdueForConfirmation([invoice({ remindersPaused: true })], NOW),
    ).toHaveLength(0);
  });

  it('największa zaległość na górze', () => {
    const selection = selectOverdueForConfirmation(
      [
        invoice({ id: 'a', grossTotal: 500 }),
        invoice({ id: 'b', grossTotal: 9000 }),
      ],
      NOW,
    );
    expect(selection[0]!.invoice.id).toBe('b');
  });
});

describe('K-01 — karta', () => {
  it('AWARIA: przy każdej pozycji jest NUMER, KWOTA I DATA', () => {
    // Sama nazwa kontrahenta przy dwóch fakturach tej samej firmy to prosta
    // droga do zamknięcia niewłaściwej należności.
    const selection = selectOverdueForConfirmation(
      [invoice({ id: 'a', number: '5/2026' }), invoice({ id: 'b', number: '6/2026' })],
      NOW,
    );
    const proposal = buildPaymentConfirmProposal({
      tenantId: 'ten-1',
      selection,
      now: NOW,
    })!;

    const entries = proposal.payload?.invoices as Array<Record<string, unknown>>;
    for (const entry of entries) {
      expect(entry.number).toBeTruthy();
      expect(entry.amount).toBeTruthy();
      expect(entry.dueDate).toBeTruthy();
    }
  });

  it('jedna karta na wszystkie zaległości', () => {
    const selection = selectOverdueForConfirmation(
      [invoice({ id: 'a' }), invoice({ id: 'b' }), invoice({ id: 'c' })],
      NOW,
    );
    const proposal = buildPaymentConfirmProposal({
      tenantId: 'ten-1',
      selection,
      now: NOW,
    })!;

    expect(proposal.title).toContain('3 zaległe');
    expect(proposal.body).toContain('12 900,00 zł');
  });

  it('oferuje odłożenie o tydzień', () => {
    const proposal = buildPaymentConfirmProposal({
      tenantId: 'ten-1',
      selection: selectOverdueForConfirmation([invoice()], NOW),
      now: NOW,
    })!;
    expect(proposal.payload?.snoozeDays).toBe(SNOOZE_DAYS);
  });

  it('brak zaległości to brak karty', () => {
    expect(
      buildPaymentConfirmProposal({ tenantId: 'ten-1', selection: [], now: NOW }),
    ).toBeNull();
  });
});

describe('K-01 — odpowiedzi', () => {
  it('AWARIA: rzeczywistość nie jest binarna — wpłata częściowa', () => {
    // Bez trzeciej odpowiedzi klient musiałby skłamać agentowi, żeby ten
    // przestał pytać. Od tego momentu wszystkie dane byłyby fałszywe.
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: 1000, outstanding: 4300 }),
    ).toBe('partial');
  });

  it('pełna wpłata z groszową tolerancją', () => {
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: 4300, outstanding: 4300 }),
    ).toBe('full');
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: 4299.995, outstanding: 4300 }),
    ).toBe('full');
  });

  it('kwota większa od należności to pomyłka w pisaniu, nie nadpłata', () => {
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: 43000, outstanding: 4300 }),
    ).toBe('invalid');
  });

  it('zero i wartości bez sensu odrzucone', () => {
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: 0, outstanding: 4300 }),
    ).toBe('invalid');
    expect(
      classifyConfirmation({ invoiceId: 'a', amount: Number.NaN, outstanding: 4300 }),
    ).toBe('invalid');
  });
});
