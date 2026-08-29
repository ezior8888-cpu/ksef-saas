import { describe, expect, it } from 'vitest';

import {
  buildContractorCheckProposal,
  classifyRegistry,
  markManual,
  mergeRegistryData,
  planAfterOutage,
  REFRESHABLE_FIELDS,
  RETRY_AFTER_MINUTES,
  shouldWarn,
  type RegistryLookup,
} from '@/lib/flo/functions/contractor-check';

/**
 * P-08 — prześwietlenie kontrahenta (krok 44).
 *
 * Trzy awarie: fałszywy alarm na kimś, kto nie ma prawa być w rejestrze;
 * nadpisanie ręcznej poprawki klienta; awaria rejestru blokująca pracę.
 */

const NOW = new Date('2026-09-15T09:00:00.000Z');

function lookup(overrides: Partial<RegistryLookup> = {}): RegistryLookup {
  return {
    vatStatus: 'active',
    found: true,
    reachable: true,
    isNaturalPerson: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// AWARIA 1 — fałszywy alarm
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 1 — trzy stany zamiast dwóch', () => {
  it('czynny podatnik: cisza', () => {
    expect(classifyRegistry(lookup())).toBe('active');
    expect(shouldWarn('active')).toBe(false);
  });

  it('ZWOLNIONY PODMIOTOWO to stan normalny, nie brak', () => {
    // Tak wygląda w rejestrze większość naszych własnych klientów.
    expect(classifyRegistry(lookup({ vatStatus: 'exempt' }))).toBe('active');
  });

  it('OSOBA FIZYCZNA nigdy nie jest podejrzana', () => {
    // Nie ma wpisu, bo nie ma prawa go mieć. Logika dwustanowa oznaczyłaby
    // ją jako podejrzaną i agent straszyłby przy połowie faktur.
    expect(classifyRegistry(lookup({ isNaturalPerson: true, vatStatus: 'unknown' }))).toBe(
      'not_listed',
    );
    expect(
      classifyRegistry(lookup({ isNaturalPerson: true, vatStatus: 'inactive', found: true })),
    ).toBe('not_listed');
    expect(shouldWarn('not_listed')).toBe(false);
  });

  it('brak wpisu NIE jest zarzutem', () => {
    expect(classifyRegistry(lookup({ vatStatus: 'unknown', found: false }))).toBe('not_listed');
    expect(shouldWarn('not_listed')).toBe(false);
  });

  it('wykreślenie ma sens tylko dla kogoś, kto w rejestrze BYŁ', () => {
    expect(classifyRegistry(lookup({ vatStatus: 'inactive', found: true }))).toBe('removed');
    expect(classifyRegistry(lookup({ vatStatus: 'inactive', found: false }))).toBe('not_listed');
  });

  it('TYLKO wykreślenie uruchamia ostrzeżenie', () => {
    // Ostrzeganie o braku wpisu zamieniłoby funkcję w szum, a szum uczy
    // klikać „ukryj" bez czytania — i wtedy nie zadziała też to jedno
    // ostrzeżenie, które ma znaczenie.
    expect(shouldWarn('removed')).toBe(true);
    expect(shouldWarn('active')).toBe(false);
    expect(shouldWarn('not_listed')).toBe(false);
    expect(shouldWarn('unavailable')).toBe(false);
  });

  it('karta powstaje wyłącznie przy wykreśleniu', () => {
    for (const state of [lookup(), lookup({ vatStatus: 'exempt' }), lookup({ found: false, vatStatus: 'unknown' })]) {
      expect(
        buildContractorCheckProposal({
          tenantId: 't1',
          contractorId: 'c1',
          contractorName: 'ACME',
          lookup: state,
          now: NOW,
        }),
      ).toBeNull();
    }

    expect(
      buildContractorCheckProposal({
        tenantId: 't1',
        contractorId: 'c1',
        contractorName: 'ACME',
        lookup: lookup({ vatStatus: 'inactive' }),
        now: NOW,
      }),
    ).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Ton
// ═══════════════════════════════════════════════════════════════

describe('ton — „sprawdź przed wystawieniem", nigdy „nie wystawiaj"', () => {
  const proposal = buildContractorCheckProposal({
    tenantId: 't1',
    contractorId: 'c1',
    contractorName: 'ACME Sp. z o.o.',
    lookup: lookup({ vatStatus: 'inactive' }),
    removalDate: '2026-06-30',
    now: NOW,
  });

  it('mówi „sprawdź to przed wystawieniem"', () => {
    expect(proposal?.body).toContain('Sprawdź to przed wystawieniem');
  });

  it('NIGDY nie zakazuje wystawienia', () => {
    // Wykreślenie nie jest zakazem współpracy — agent nie wie, czy klient
    // ma powód wystawić tę fakturę.
    const text = `${proposal?.title} ${proposal?.body}`;
    expect(text).not.toMatch(/nie wystawiaj|zablokowa|nie wolno/i);
  });

  it('podaje datę wykreślenia, gdy rejestr ją zna', () => {
    expect(proposal?.body).toContain('30.06.2026');
  });

  it('agent nie blokuje wystawienia — prowadzi do danych', () => {
    expect(proposal?.payload?.primaryIntent).toBe('open');
  });

  it('jeden kontrahent = jedna karta', () => {
    expect(proposal?.topicKey).toBe('contractor.check:c1');
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 2 — nadpisanie ręcznej poprawki
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 2 — ręczna poprawka jest nietykalna', () => {
  const current = {
    name: 'ACME Polska (biuro Wrocław)',
    address: 'ul. Klientowa 1',
    vat_status: 'active',
    bank_accounts_validated: ['PL11'],
  };

  it('pole poprawione ręcznie NIE JEST nadpisywane', () => {
    // Klient poprawia drugi raz, trzeci — i przestaje ufać całej
    // automatyzacji, słusznie.
    const { merged, skipped } = mergeRegistryData(
      current,
      { name: 'ACME POLSKA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ' },
      ['name'],
    );
    expect(merged.name).toBe('ACME Polska (biuro Wrocław)');
    expect(skipped).toEqual(['name']);
  });

  it('ZNACZNIK DZIAŁA PER POLE, nie na całym rekordzie', () => {
    // Poprawiona nazwa nie ma powodu blokować odświeżania statusu VAT,
    // który jest jedyną rzeczą, o którą w tej funkcji naprawdę chodzi.
    const { merged, skipped } = mergeRegistryData(
      current,
      { name: 'ACME POLSKA SP. Z O.O.', vat_status: 'inactive' },
      ['name'],
    );
    expect(merged.name).toBe('ACME Polska (biuro Wrocław)');
    expect(merged.vat_status).toBe('inactive');
    expect(skipped).toEqual(['name']);
  });

  it('bez znaczników rejestr aktualizuje wszystko', () => {
    const { merged, skipped } = mergeRegistryData(
      current,
      { name: 'ACME POLSKA SP. Z O.O.', address: 'ul. Rejestrowa 2' },
      [],
    );
    expect(merged.name).toBe('ACME POLSKA SP. Z O.O.');
    expect(merged.address).toBe('ul. Rejestrowa 2');
    expect(skipped).toEqual([]);
  });

  it('pola nieobecne w odpowiedzi rejestru zostają nietknięte', () => {
    const { merged } = mergeRegistryData(current, { vat_status: 'exempt' }, []);
    expect(merged.name).toBe('ACME Polska (biuro Wrocław)');
    expect(merged.address).toBe('ul. Klientowa 1');
  });

  it('znacznik jest trwały i idempotentny', () => {
    expect(markManual(['name'], ['name'])).toEqual(['name']);
    expect(markManual(['name'], ['address'])).toEqual(['address', 'name']);
  });

  it('lista odświeżanych pól obejmuje status VAT', () => {
    expect(REFRESHABLE_FIELDS).toContain('vat_status');
    expect(REFRESHABLE_FIELDS).toContain('name');
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 3 — M17, awaria rejestru
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 3 — M17: cudze API nie zatrzymuje pracy', () => {
  it('niedostępny rejestr to stan NIEZNANY, nie stan zły', () => {
    expect(classifyRegistry(lookup({ reachable: false, vatStatus: 'unknown' }))).toBe(
      'unavailable',
    );
    expect(shouldWarn('unavailable')).toBe(false);
  });

  it('AWARIA NIGDY NIE BLOKUJE WYSTAWIENIA', () => {
    const plan = planAfterOutage(NOW);
    expect(plan.blocksInvoicing).toBe(false);
  });

  it('nie zawracamy głowy klientowi w chwili wystawiania', () => {
    // Komunikat „nie mogłem sprawdzić kontrahenta" dotyczy sprawy, na którą
    // klient i tak nic nie poradzi.
    expect(planAfterOutage(NOW).tellNow).toBe(false);
    expect(
      buildContractorCheckProposal({
        tenantId: 't1',
        contractorId: 'c1',
        contractorName: 'ACME',
        lookup: lookup({ reachable: false }),
        now: NOW,
      }),
    ).toBeNull();
  });

  it('ponawiamy w tle', () => {
    const plan = planAfterOutage(NOW);
    expect(Date.parse(plan.retryAt) - NOW.getTime()).toBe(RETRY_AFTER_MINUTES * 60_000);
  });

  it('gdy ponowienie znajdzie wykreślenie, mówimy PO FAKCIE i tłumaczymy czemu', () => {
    const proposal = buildContractorCheckProposal({
      tenantId: 't1',
      contractorId: 'c1',
      contractorName: 'ACME',
      lookup: lookup({ vatStatus: 'inactive' }),
      afterRetry: true,
      now: NOW,
    });
    expect(proposal?.body).toContain('Sprawdziłem ponownie');
    expect(proposal?.body).toContain('rejestr nie odpowiadał');
  });
});
