import { describe, expect, it } from 'vitest';

import {
  addressState,
  buildAnnexProposal,
  buildDeliveryProposal,
  buildMonthClosePackageProposal,
  checkReadiness,
  CLOSE_WINDOW_DAYS,
  decideMonthClose,
  recheckBeforeSend,
  shouldRememberAddress,
  type CloseReadiness,
  type MonthCloseInput,
} from '@/lib/flo/functions/month-close';
import { formatPln } from '@/lib/flo/money';

/**
 * B-01 — domknięcie miesiąca (krok 41). PROMIEŃ RAŻENIA 4.
 *
 * Trzy awarie: niekompletna paczka u księgowej, zły adres, ciche dosłanie
 * spóźnionego dokumentu.
 */

const d = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

function readiness(overrides: Partial<CloseReadiness> = {}): CloseReadiness {
  return {
    inboxFullyFetched: true,
    unreviewedDocuments: 0,
    ksefInvoiceCount: 34,
    localInvoiceCount: 34,
    ...overrides,
  };
}

function close(overrides: Partial<MonthCloseInput> = {}): MonthCloseInput {
  return {
    periodKey: '2026-08',
    readiness: readiness(),
    receiptPairs: 0,
    paidWithoutPayment: 0,
    alreadySent: false,
    today: d('2026-09-02'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// AWARIA 1 — niekompletna paczka
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 1 — trzy warunki przed domknięciem', () => {
  it('nierozładowana skrzynka KSeF blokuje', () => {
    expect(checkReadiness(readiness({ inboxFullyFetched: false }))).toEqual([
      'inbox_incomplete',
    ]);
  });

  it('nieprzejrzane dokumenty blokują', () => {
    expect(checkReadiness(readiness({ unreviewedDocuments: 3 }))).toEqual([
      'unreviewed_documents',
    ]);
  });

  it('rozjazd liczby faktur z KSeF blokuje', () => {
    expect(checkReadiness(readiness({ ksefInvoiceCount: 35 }))).toEqual([
      'count_mismatch',
    ]);
  });

  it('komplet warunków otwiera drogę', () => {
    expect(checkReadiness(readiness())).toEqual([]);
  });

  it('KARTA W OGÓLE NIE POWSTAJE, dopóki miesiąc nie jest kompletny', () => {
    // Pokazanie jej z dopiskiem „wyślij mimo braków" byłoby zaproszeniem
    // do wysłania niepełnej paczki.
    const verdict = decideMonthClose(close({ readiness: readiness({ unreviewedDocuments: 2 }) }));
    expect(verdict.kind).toBe('blocked');

    expect(
      buildMonthClosePackageProposal({
        tenantId: 't1',
        close: close({ readiness: readiness({ unreviewedDocuments: 2 }) }),
        address: { kind: 'known', email: 'anna@biuro.pl' },
        documentCount: 34,
      }),
    ).toBeNull();
  });

  it('SPRAWDZENIE POWTARZA SIĘ PRZY KLIKNIĘCIU', () => {
    // Między pokazaniem karty a kliknięciem mija kilka godzin — w tym czasie
    // mogła dojść faktura z KSeF.
    const result = recheckBeforeSend({
      readiness: readiness({ ksefInvoiceCount: 35 }),
      address: { kind: 'known', email: 'anna@biuro.pl' },
      confirmedEmail: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('stale');
    expect(result.message).toContain('nowe dokumenty');
  });

  it('kompletny miesiąc i znany adres przechodzą', () => {
    expect(
      recheckBeforeSend({
        readiness: readiness(),
        address: { kind: 'known', email: 'anna@biuro.pl' },
        confirmedEmail: null,
      }),
    ).toEqual({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 2 — zły adres księgowej
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 2 — adres księgowej', () => {
  it('brak adresu = pytamy', () => {
    expect(addressState({ email: null, deliveredBefore: false })).toEqual({ kind: 'ask' });
  });

  it('adres bez historii doręczeń = POTWIERDZAMY osobno', () => {
    expect(addressState({ email: 'anna@biuro.pl', deliveredBefore: false })).toEqual({
      kind: 'confirm',
      email: 'anna@biuro.pl',
    });
  });

  it('adres z udanym doręczeniem nie zawraca głowy', () => {
    expect(addressState({ email: 'anna@biuro.pl', deliveredBefore: true })).toEqual({
      kind: 'known',
      email: 'anna@biuro.pl',
    });
  });

  it('„wysyłam do anna@biuro.pl — zgadza się?" pada przed pierwszą wysyłką', () => {
    const proposal = buildMonthClosePackageProposal({
      tenantId: 't1',
      close: close(),
      address: { kind: 'confirm', email: 'anna@biuro.pl' },
      documentCount: 34,
    });
    expect(proposal?.body).toContain('Wysyłam do anna@biuro.pl — zgadza się?');
    expect(proposal?.payload?.needsAddressConfirmation).toBe(true);
  });

  it('bez potwierdzenia człowieka wysyłka NIE RUSZA', () => {
    // Wysyłka bez tego byłaby zgodą przez milczenie na adres, którego nikt
    // nie przeczytał.
    const result = recheckBeforeSend({
      readiness: readiness(),
      address: { kind: 'confirm', email: 'anna@biuro.pl' },
      confirmedEmail: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('blocked');
  });

  it('ADRES ZAPAMIĘTUJEMY DOPIERO PO UDANYM DORĘCZENIU', () => {
    // Adres z odbiciem zapisany jako „sprawdzony" zamieniłby jednorazową
    // literówkę w trwały błąd: kolejne miesiące szłyby pod niego bez pytania.
    expect(shouldRememberAddress({ delivered: true })).toBe(true);
    expect(shouldRememberAddress({ delivered: false })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 3 — ciche dosłanie
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 3 — spóźniony dokument', () => {
  const late = [
    {
      id: 'inv-9',
      number: 'FV/2026/08/12',
      contractorName: 'Hurtownia Nowak',
      gross: 1_230,
      arrivedOn: '2026-09-08',
    },
  ];

  const annex = buildAnnexProposal({
    tenantId: 't1',
    periodKey: '2026-08',
    documents: late,
    now: d('2026-09-08'),
  });

  it('powstaje propozycja ANEKSU, nie ciche dosłanie', () => {
    expect(annex?.payload?.isAnnex).toBe(true);
    expect(annex?.body).toContain('aneks');
  });

  it('aneks nazywa dokument po numerze, kontrahencie i kwocie', () => {
    // Księgowa z dwiema paczkami różniącymi się niewidocznie nie ma jak
    // zgadnąć, którą zaksięgowała.
    expect(annex?.body).toContain('FV/2026/08/12');
    expect(annex?.body).toContain('Hurtownia Nowak');
    expect(annex?.body).toContain(formatPln(1_230));
  });

  it('aneks ma WŁASNY temat — nie podmienia karty domknięcia', () => {
    // To dwie różne zgody na dwie różne przesyłki.
    expect(annex?.topicKey).toBe('accountant.annex:2026-08');
    expect(annex?.topicKey).not.toContain('accountant.package:');
  });

  it('brak spóźnionych dokumentów nie produkuje pustego aneksu', () => {
    expect(
      buildAnnexProposal({ tenantId: 't1', periodKey: '2026-08', documents: [] }),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Cisza po wysyłce jest stanem zabronionym
// ═══════════════════════════════════════════════════════════════

describe('meldunek po wysyłce', () => {
  it('doręczenie ma swoją kartę', () => {
    const proposal = buildDeliveryProposal({
      tenantId: 't1',
      periodKey: '2026-08',
      outcome: { delivered: true, email: 'anna@biuro.pl' },
      now: d('2026-09-02'),
    });
    expect(proposal.kind).toBe('accountant.delivery');
    expect(proposal.title).toContain('doręczona');
  });

  it('odbicie jest PILNE i mówi, że adresu nie zapamiętano', () => {
    // Klient jest przekonany, że księgowa ma komplet.
    const proposal = buildDeliveryProposal({
      tenantId: 't1',
      periodKey: '2026-08',
      outcome: {
        delivered: false,
        email: 'anna@biruo.pl',
        bounceReason: 'domena nie istnieje',
      },
      now: d('2026-09-02'),
    });

    expect(proposal.priority).toBe(5);
    expect(proposal.body).toContain('domena nie istnieje');
    expect(proposal.body).toContain('Adres nie został zapamiętany');
    expect(proposal.payload?.primaryLabel).toBe('Popraw adres');
  });
});

// ═══════════════════════════════════════════════════════════════
// Okno i lista kontrolna
// ═══════════════════════════════════════════════════════════════

describe('okno i lista kontrolna', () => {
  it('propozycja tylko w pierwszych trzech dniach miesiąca', () => {
    for (const day of CLOSE_WINDOW_DAYS) {
      const today = d(`2026-09-0${day}`);
      expect(decideMonthClose(close({ today })).kind).toBe('ready');
    }
    expect(decideMonthClose(close({ today: d('2026-09-05') }))).toEqual({
      kind: 'silent',
      reason: 'outside_window',
    });
  });

  it('wysłana paczka zamyka temat', () => {
    expect(decideMonthClose(close({ alreadySent: true }))).toEqual({
      kind: 'silent',
      reason: 'already_sent',
    });
  });

  it('lista kontrolna zbiera pozycje z W-02, K-01 i T-05', () => {
    const verdict = decideMonthClose(
      close({
        receiptPairs: 2,
        paidWithoutPayment: 1,
        setAsideCorrection: 'Odłożone 2 000,00 zł, wychodzi 2 850,00 zł — dołóż 850,00 zł.',
      }),
    );
    expect(verdict.kind).toBe('ready');
    if (verdict.kind !== 'ready') return;
    expect(verdict.checklist.map((item) => item.source)).toEqual(['W-02', 'K-01', 'T-05']);
    expect(verdict.checklist[0]?.label).toContain('2 pary paragon–faktura');
    expect(verdict.checklist[1]?.label).toContain('1 pozycja');
  });

  it('czysty miesiąc mówi wprost, że nic nie zostało', () => {
    const proposal = buildMonthClosePackageProposal({
      tenantId: 't1',
      close: close(),
      address: { kind: 'known', email: 'anna@biuro.pl' },
      documentCount: 34,
    });
    expect(proposal?.body).toContain('Nic nie zostało do wyjaśnienia');
    expect(proposal?.body).toContain('Wysłać paczkę na anna@biuro.pl?');
  });

  it('jeden okres = jedna karta domknięcia', () => {
    const proposal = buildMonthClosePackageProposal({
      tenantId: 't1',
      close: close(),
      address: { kind: 'known', email: 'anna@biuro.pl' },
      documentCount: 34,
    });
    expect(proposal?.topicKey).toBe('accountant.package:2026-08');
  });
});
