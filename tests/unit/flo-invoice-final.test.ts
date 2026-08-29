import { describe, expect, it } from 'vitest';

import {
  advancesTotal,
  buildFinalInvoiceProposal,
  decideFinalInvoice,
  hasSimilarInvoice,
  inspectChain,
  needsOperatorAttention,
  orderGross,
  postponeUntil,
  PROJECT_ONGOING_DAYS,
  recheckBeforeIssue,
  SIMILAR_WINDOW_DAYS,
  type AdvanceChain,
  type AdvanceLink,
  type FinalDecisionInput,
} from '@/lib/flo/functions/invoice-final';
import type { InvoiceLine } from '@/types/invoice-types';

/**
 * P-07 — zaliczka i faktura końcowa (krok 34 planu).
 *
 * Trzy awarie: podwójne rozliczenie zaliczki, zła kwota do zapłaty,
 * zaczepianie w trakcie trwającego projektu.
 */

const TODAY = new Date('2026-09-15T09:00:00.000Z');

/** Zamówienie na 12 300 zł brutto: 10 000 netto + 23% VAT. */
const ORDER_LINES: InvoiceLine[] = [
  {
    name: 'Remont łazienki',
    unit: 'usł.',
    quantity: 1,
    unitPriceNet: 10_000,
    vatRate: '23',
  },
];

function advance(overrides: Partial<AdvanceLink> = {}): AdvanceLink {
  return {
    id: 'root',
    number: 'ZAL/2026/01',
    gross: 4_920,
    issueDate: '2026-06-01',
    parentInvoiceId: null,
    voided: false,
    ...overrides,
  };
}

function chain(overrides: Partial<AdvanceChain> = {}): AdvanceChain {
  return {
    rootInvoiceId: 'root',
    contractorId: 'c1',
    contractorName: 'Jan Kowalski',
    orderLines: ORDER_LINES,
    advances: [advance()],
    deliveryDate: '2026-09-10',
    finalInvoiceId: null,
    ...overrides,
  };
}

function decision(overrides: Partial<FinalDecisionInput> = {}): FinalDecisionInput {
  return {
    chain: chain(),
    today: TODAY,
    similarInvoiceNearby: false,
    xsdValid: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════

describe('P-07 — ścieżka zwykła', () => {
  it('po dacie realizacji proponuje fakturę na resztę kwoty', () => {
    const verdict = decideFinalInvoice(decision());

    expect(verdict.kind).toBe('propose');
    if (verdict.kind !== 'propose') return;
    expect(verdict.orderGross).toBe(12_300);
    expect(verdict.advancesTotal).toBe(4_920);
    expect(verdict.amountDue).toBe(7_380);
  });

  it('kwota idzie z kalkulatora faktur, nie z osobnego wzoru', () => {
    // 3 pozycje z różnym VAT — gdyby agent liczył po swojemu, rozjechałby
    // się z tym, co pokaże faktura.
    const lines: InvoiceLine[] = [
      { name: 'Usługa', unit: 'usł.', quantity: 2, unitPriceNet: 1_234.56, vatRate: '23' },
      { name: 'Materiał', unit: 'szt.', quantity: 3, unitPriceNet: 99.99, vatRate: '8' },
      { name: 'Transport', unit: 'usł.', quantity: 1, unitPriceNet: 350, vatRate: '23' },
    ];
    const c = chain({ orderLines: lines, advances: [advance({ gross: 1_000 })] });

    const verdict = decideFinalInvoice(decision({ chain: c }));
    expect(verdict.kind).toBe('propose');
    if (verdict.kind !== 'propose') return;
    expect(verdict.orderGross).toBe(orderGross(c));
    expect(verdict.amountDue).toBe(orderGross(c) - 1_000);
  });

  it('suma zaliczek pomija anulowane', () => {
    const c = chain({
      advances: [
        advance(),
        advance({ id: 'a2', parentInvoiceId: 'root', gross: 2_000, voided: true }),
      ],
    });
    expect(advancesTotal(c)).toBe(4_920);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 1 — podwójne rozliczenie zaliczki
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 1 — podwójne rozliczenie zaliczki', () => {
  it('faktura końcowa wpięta w łańcuch zamyka sprawę', () => {
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ finalInvoiceId: 'fin-1' }) }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'already_final' });
  });

  it('faktura o zbliżonej kwocie wystawiona POZA łańcuchem też zamyka sprawę', () => {
    // Klient wystawił ją ręcznie jako zwykłą — pierwsza warstwa (łańcuch)
    // jej nie widzi. Bez tej drugiej warstwy w rejestrze stanęłyby dwa
    // dokumenty rozliczające tę samą zaliczkę.
    const verdict = decideFinalInvoice(decision({ similarInvoiceNearby: true }));
    expect(verdict).toEqual({ kind: 'silent', reason: 'similar_invoice_nearby' });
  });

  it('rozpoznaje fakturę na zbliżoną kwotę w oknie 30 dni', () => {
    const found = hasSimilarInvoice(
      [{ grossTotal: 7_200, issueDate: '2026-09-12' }],
      7_380,
      TODAY,
    );
    expect(found).toBe(true);
  });

  it('nie myli faktury z innej sprawy — inna kwota', () => {
    const found = hasSimilarInvoice(
      [{ grossTotal: 1_500, issueDate: '2026-09-12' }],
      7_380,
      TODAY,
    );
    expect(found).toBe(false);
  });

  it('nie sięga poza okno 30 dni', () => {
    const outside = new Date(TODAY.getTime() - (SIMILAR_WINDOW_DAYS + 2) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(hasSimilarInvoice([{ grossTotal: 7_380, issueDate: outside }], 7_380, TODAY)).toBe(
      false,
    );
  });

  it('przy wykonaniu sprawdza łańcuch DRUGI RAZ', () => {
    // Między pokazaniem karty a kliknięciem klient wystawił fakturę sam.
    const result = recheckBeforeIssue(
      decision({ chain: chain({ finalInvoiceId: 'fin-1' }) }),
      7_380,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'stale',
      message: 'Faktura końcowa dla tego zamówienia już istnieje.',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 2 — zła kwota do zapłaty
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 2 — zła kwota, niespójny łańcuch', () => {
  it('zaliczki większe niż zamówienie: MILCZENIE wobec klienta, sprawa do operatora', () => {
    // Ujemna kwota do zapłaty na karcie byłaby przerzuceniem naszego błędu
    // w danych na klienta.
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ advances: [advance({ gross: 20_000 })] }) }),
    );

    expect(verdict.kind).toBe('operator');
    if (verdict.kind !== 'operator') return;
    expect(verdict.problem).toBe('advances_exceed_order');
    expect(needsOperatorAttention(verdict)).toBe(true);
  });

  it('zaliczka wskazująca na inne zamówienie nie zszywa dwóch spraw w jedną', () => {
    const c = chain({
      advances: [advance(), advance({ id: 'a2', parentInvoiceId: 'inne-zamowienie' })],
    });
    expect(inspectChain(c)).toBe('broken_parent');
    expect(decideFinalInvoice(decision({ chain: c })).kind).toBe('operator');
  });

  it('brak pozycji zamówienia nie kończy się fakturą na zero', () => {
    const c = chain({ orderLines: [] });
    expect(inspectChain(c)).toBe('no_order_lines');
    expect(decideFinalInvoice(decision({ chain: c })).kind).toBe('operator');
  });

  it('szkic nieprzechodzący walidacji FA(3) nie trafia do klienta', () => {
    const verdict = decideFinalInvoice(decision({ xsdValid: false }));
    expect(verdict.kind).toBe('operator');
    if (verdict.kind !== 'operator') return;
    expect(verdict.problem).toBe('xsd_invalid');
  });

  it('zaliczki pokrywające całość: agent milczy, nie proponuje faktury na zero', () => {
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ advances: [advance({ gross: 12_300 })] }) }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'fully_settled' });
  });

  it('zmiana kwoty między zgodą a wykonaniem unieważnia zgodę', () => {
    // Klient zgodził się na 7 380 zł. W międzyczasie doszła druga zaliczka.
    const c = chain({
      advances: [advance(), advance({ id: 'a2', parentInvoiceId: 'root', gross: 2_000 })],
    });
    const result = recheckBeforeIssue(decision({ chain: c }), 7_380);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('stale');
    expect(result.message).toContain('5 380');
  });

  it('kwota bez zmian przechodzi', () => {
    expect(recheckBeforeIssue(decision(), 7_380)).toEqual({ ok: true, amountDue: 7_380 });
  });

  it('niespójny łańcuch przy wykonaniu blokuje, ale nie straszy klienta', () => {
    const result = recheckBeforeIssue(
      decision({ chain: chain({ advances: [advance({ gross: 20_000 })] }) }),
      7_380,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('blocked');
    // Klient nie ma się dowiadywać, że mamy rozjechane dane — ma się
    // dowiedzieć, że ktoś się tym zajmuje.
    expect(result.message).not.toContain('łańcuch');
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 3 — zaczepianie w trakcie projektu
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 3 — projekt jeszcze trwa', () => {
  it('przed datą realizacji agent milczy', () => {
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ deliveryDate: '2026-12-01' }) }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'not_delivered_yet' });
  });

  it('w dniu realizacji już wolno się odezwać', () => {
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ deliveryDate: '2026-09-15' }) }),
    );
    expect(verdict.kind).toBe('propose');
  });

  it('brak daty realizacji = milczenie, nie zgadywanie', () => {
    const verdict = decideFinalInvoice(
      decision({ chain: chain({ deliveryDate: null }) }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'no_delivery_date' });
  });

  it('„Projekt trwa" odsuwa o 30 dni', () => {
    const until = postponeUntil(TODAY);
    expect(until.getTime() - TODAY.getTime()).toBe(PROJECT_ONGOING_DAYS * 86_400_000);

    const verdict = decideFinalInvoice(
      decision({ postponedUntil: until.toISOString() }),
    );
    expect(verdict).toEqual({ kind: 'silent', reason: 'postponed' });
  });

  it('po upływie odsunięcia agent wraca', () => {
    const past = new Date(TODAY.getTime() - 86_400_000).toISOString();
    expect(decideFinalInvoice(decision({ postponedUntil: past })).kind).toBe('propose');
  });

  it('„Projekt trwa" jest ODSUNIĘCIEM, nie odrzuceniem', () => {
    // Gdyby siedziało na `dismiss`, dwa kliknięcia wyciszyłyby rodzaj na
    // 90 dni — i agent zamilkłby o obowiązku ustawowym akurat u klientów
    // prowadzących najdłuższe projekty.
    const proposal = buildFinalInvoiceProposal({
      tenantId: 't1',
      chain: chain(),
      verdict: { kind: 'propose', amountDue: 7_380, advancesTotal: 4_920, orderGross: 12_300 },
      draftInvoiceId: 'draft-1',
      previewLines: [],
      dueLabel: '14 dni',
      now: TODAY,
    });

    const secondary = proposal.payload?.secondary as { label: string; intent: string }[];
    expect(secondary).toHaveLength(1);
    expect(secondary[0]!.label).toBe('Projekt trwa');
    expect(secondary[0]!.intent).toBe('snooze');
    expect(secondary.some((action) => action.intent === 'dismiss')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

describe('P-07 — karta', () => {
  const proposal = buildFinalInvoiceProposal({
    tenantId: 't1',
    chain: chain(),
    verdict: { kind: 'propose', amountDue: 7_380, advancesTotal: 4_920, orderGross: 12_300 },
    draftInvoiceId: 'draft-1',
    previewLines: [
      { name: 'Remont łazienki', qty: '1', net: '10 000,00', vat: '2 300,00', gross: '12 300,00' },
    ],
    dueLabel: '14 dni',
    now: TODAY,
  });

  it('klucz tematu wisi na korzeniu łańcucha, nie na okresie', () => {
    // Jedno zamówienie = jedna faktura końcowa, choćby projekt trwał rok.
    expect(proposal.topicKey).toBe('invoice.final:root');
  });

  it('podaje wszystkie trzy kwoty gotowymi napisami', () => {
    expect(proposal.body).toContain('4 920');
    expect(proposal.body).toContain('12 300');
    expect(proposal.body).toContain('7 380');
  });

  it('szkic NIE DOSTAJE NUMERU', () => {
    expect(proposal.body).toContain('Numer nadam przy wysyłce');
    expect(JSON.stringify(proposal.payload)).not.toMatch(/"(invoiceNumber|number)"\s*:/);
  });

  it('podgląd pokazuje kwotę do rozliczenia, nie wartość zamówienia', () => {
    const preview = proposal.payload?.preview as { total: string; invoiceId: string };
    expect(preview.total).toContain('7 380');
    expect(preview.invoiceId).toBe('draft-1');
  });

  it('anulowanie zaliczki zmienia odcisk danych', () => {
    const withVoided = buildFinalInvoiceProposal({
      tenantId: 't1',
      chain: chain({ advances: [advance({ voided: true })] }),
      verdict: { kind: 'propose', amountDue: 7_380, advancesTotal: 4_920, orderGross: 12_300 },
      draftInvoiceId: 'draft-1',
      previewLines: [],
      dueLabel: '14 dni',
      now: TODAY,
    });
    expect(withVoided.fingerprint).not.toBe(proposal.fingerprint);
  });

  it('karta żyje kwartał — obowiązek ustawowy nie znika po tygodniu', () => {
    const days = (proposal.expiresAt.getTime() - TODAY.getTime()) / 86_400_000;
    expect(days).toBe(90);
  });

  it('pokazuje, skąd się wzięła', () => {
    expect(proposal.evidence?.map((e) => e.href)).toContain('/invoices/root');
  });
});
