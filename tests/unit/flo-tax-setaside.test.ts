import { describe, expect, it } from 'vitest';

import {
  buildCorrection,
  buildSetAsideProposal,
  computeSetAside,
  FORBIDDEN_PAYLOAD_KEYS,
  MIN_SETASIDE_PLN,
  type PeriodLedger,
} from '@/lib/flo/functions/tax-setaside';
import { formatPln } from '@/lib/flo/money';
import { paramsFor, type TaxParams } from '@/lib/flo/tax-params';
import type { FloTaxProfile } from '@/types/flo';

/**
 * T-05 — ile odłożyć na podatek (krok 39).
 *
 * Trzy awarie: licznik wyglądający jak portfel, procent od pojedynczej
 * faktury zamiast narastającego okresu, zmiana formy w trakcie okresu.
 */

const PARAMS = paramsFor(new Date('2026-06-01T00:00:00.000Z')) as TaxParams;
const NOW = new Date('2026-09-20T09:00:00.000Z');

function profile(overrides: Partial<FloTaxProfile> = {}): FloTaxProfile {
  return {
    form: 'liniowy',
    vat: false,
    period: 'M',
    startedOn: '2025-01-01',
    ryczaltRate: null,
    ...overrides,
  };
}

function ledger(overrides: Partial<PeriodLedger> = {}): PeriodLedger {
  return {
    periodKey: '2026-09',
    income: 20_000,
    costs: 5_000,
    alreadySetAside: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// AWARIA 1 — licznik nie może wyglądać jak portfel
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 1 — licznik nie jest portfelem', () => {
  const proposal = buildSetAsideProposal({
    tenantId: 't1',
    profile: profile(),
    ledger: ledger(),
    params: PARAMS,
    paymentAmount: 6_150,
    now: NOW,
  });

  it('ŁADUNEK NIE NIESIE SALDA ANI NICZEGO, Z CZEGO DA SIĘ JE ZBUDOWAĆ', () => {
    // Obrona jest w kontrakcie, nie w wyglądzie: dopóki serwer wysyła saldo,
    // prędzej czy później ktoś je narysuje — w dobrej wierze, przy okazji.
    const keys = Object.keys(proposal!.payload!);
    for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('ładunek nie niesie nawet „odłożone dotąd”', () => {
    expect(proposal!.payload).not.toHaveProperty('alreadySetAside');
    expect(Object.keys(proposal!.payload!)).toEqual([
      'periodKey',
      'toSetAside',
      'primaryLabel',
    ]);
  });

  it('formuła jest ZADANIOWA, z ręcznym potwierdzeniem', () => {
    expect(proposal?.title).toContain('Do odłożenia');
    expect(proposal?.payload?.primaryLabel).toBe('Odłożyłem');
  });

  it('nic nie sugeruje przelewu', () => {
    expect(JSON.stringify(proposal)).not.toMatch(/przelew|wypłać|konto bankowe/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 2 — procent od pojedynczej faktury
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 2 — narastająco na okresie, z kosztami', () => {
  it('podstawa to dochód, nie przychód', () => {
    // Naiwne „19% z każdej wpłaty” każe odkładać za dużo przez cały rok —
    // aż klient przestaje odkładać w ogóle.
    const result = computeSetAside({ profile: profile(), ledger: ledger(), params: PARAMS });
    expect(result?.base).toBe(15_000);
    expect(result?.tax).toBe(2_850);
  });

  it('dochód nie schodzi poniżej zera', () => {
    const result = computeSetAside({
      profile: profile(),
      ledger: ledger({ income: 4_000, costs: 9_000 }),
      params: PARAMS,
    });
    expect(result?.base).toBe(0);
    expect(result?.tax).toBe(0);
  });

  it('koszt dopisany w środku okresu ZMNIEJSZA to, co zostało do odłożenia', () => {
    const before = computeSetAside({
      profile: profile(),
      ledger: ledger({ alreadySetAside: 2_000 }),
      params: PARAMS,
    });
    const after = computeSetAside({
      profile: profile(),
      ledger: ledger({ costs: 12_000, alreadySetAside: 2_000 }),
      params: PARAMS,
    });

    expect(before?.toSetAside).toBe(850);
    expect(after?.toSetAside).toBe(0);
    expect(after?.overpaid).toBe(true);
  });

  it('RYCZAŁT LICZY OD PRZYCHODU — odjęcie kosztów byłoby błędem', () => {
    const result = computeSetAside({
      profile: profile({ form: 'ryczalt', ryczaltRate: 0.085 }),
      ledger: ledger(),
      params: PARAMS,
    });
    expect(result?.base).toBe(20_000);
    expect(result?.tax).toBe(1_700);
  });

  it('skala: kwota wolna i próg', () => {
    const low = computeSetAside({
      profile: profile({ form: 'skala' }),
      ledger: ledger({ income: 50_000, costs: 0 }),
      params: PARAMS,
    });
    expect(low?.tax).toBe((50_000 - 30_000) * 0.12);

    const high = computeSetAside({
      profile: profile({ form: 'skala' }),
      ledger: ledger({ income: 200_000, costs: 0 }),
      params: PARAMS,
    });
    expect(high?.tax).toBe((120_000 - 30_000) * 0.12 + (200_000 - 120_000) * 0.32);
  });

  it('drobna kwota nie zasługuje na kartę', () => {
    const proposal = buildSetAsideProposal({
      tenantId: 't1',
      profile: profile(),
      ledger: ledger({ income: 100, costs: 0 }),
      params: PARAMS,
      paymentAmount: 100,
      now: NOW,
    });
    expect(proposal).toBeNull();
    expect(19).toBeLessThan(MIN_SETASIDE_PLN);
  });
});

// ═══════════════════════════════════════════════════════════════
// AWARIA 3 — zmiana formy w trakcie okresu
// ═══════════════════════════════════════════════════════════════

describe('AWARIA 3 — zmiana profilu przelicza CAŁY okres', () => {
  const settled = ledger({ alreadySetAside: 2_850 });

  it('nowa stawka obejmuje cały okres, nie tylko kolejne wpłaty', () => {
    // Zastosowanie nowej stawki wyłącznie do przyszłych wpłat zostawia okres
    // policzony dwiema miarami naraz.
    const flat = computeSetAside({ profile: profile(), ledger: settled, params: PARAMS });
    const scale = computeSetAside({
      profile: profile({ form: 'skala' }),
      ledger: settled,
      params: PARAMS,
    });

    expect(flat?.tax).toBe(2_850);
    expect(scale?.tax).toBe(0);
    expect(scale?.overpaid).toBe(true);
  });

  it('nadwyżka NIE zamienia się w zachętę do wypłacenia sobie różnicy', () => {
    const proposal = buildSetAsideProposal({
      tenantId: 't1',
      profile: profile({ form: 'skala' }),
      ledger: settled,
      params: PARAMS,
      paymentAmount: 6_150,
      now: NOW,
    });

    expect(proposal?.title).toContain('nie musisz już nic odkładać');
    expect(proposal?.body).not.toMatch(/wypłać|odbierz|zwrot/i);
    expect(proposal?.payload?.toSetAside).toBe(0);
  });

  it('stawka pochodzi WYŁĄCZNIE z profilu — ryczałt bez stawki milczy', () => {
    // Stawek ryczałtu jest kilkanaście i wybór między nimi jest kwalifikacją,
    // nie zadaniem dla programu.
    expect(
      computeSetAside({
        profile: profile({ form: 'ryczalt', ryczaltRate: null }),
        ledger: ledger(),
        params: PARAMS,
      }),
    ).toBeNull();
  });

  it('nieznana forma opodatkowania milczy', () => {
    expect(
      computeSetAside({
        profile: profile({ form: 'nieznana' }),
        ledger: ledger(),
        params: PARAMS,
      }),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Jawność wyliczenia
// ═══════════════════════════════════════════════════════════════

describe('wzór i lista wyłączeń', () => {
  it('wzór jest widoczny w dowodach', () => {
    const proposal = buildSetAsideProposal({
      tenantId: 't1',
      profile: profile(),
      ledger: ledger(),
      params: PARAMS,
      paymentAmount: 6_150,
      now: NOW,
    });
    expect(proposal?.evidence?.[0]?.label).toContain('19%');
    expect(proposal?.evidence?.[0]?.label).toContain(formatPln(15_000));
  });

  it('agent mówi wprost, czego w liczbie NIE MA', () => {
    // Składka zdrowotna liczy się inaczej dla każdej formy — plan wymienia
    // ją wprost wśród pozycji, których agent nie liczy bez opinii.
    const result = computeSetAside({ profile: profile(), ledger: ledger(), params: PARAMS });
    expect(result?.excluded.join(' ')).toContain('składka zdrowotna');

    const proposal = buildSetAsideProposal({
      tenantId: 't1',
      profile: profile(),
      ledger: ledger(),
      params: PARAMS,
      paymentAmount: 6_150,
      now: NOW,
    });
    expect(proposal?.evidence?.[1]?.label).toContain('Nie wliczono');
  });
});

// ═══════════════════════════════════════════════════════════════
// Korekta w domknięciu miesiąca
// ═══════════════════════════════════════════════════════════════

describe('korekta przy domknięciu miesiąca', () => {
  it('„odłożone 2 000, wychodzi 2 850 — dołóż 850”', () => {
    const correction = buildCorrection({
      profile: profile(),
      ledger: ledger({ alreadySetAside: 2_000 }),
      params: PARAMS,
    });
    expect(correction?.delta).toBe(850);
    expect(correction?.sentence).toContain('dołóż');
    expect(correction?.sentence).toContain(formatPln(850));
  });

  it('nadwyżka zostaje na kolejny okres, nie wraca do kieszeni', () => {
    const correction = buildCorrection({
      profile: profile(),
      ledger: ledger({ alreadySetAside: 4_000 }),
      params: PARAMS,
    });
    expect(correction?.delta).toBe(-1_150);
    expect(correction?.sentence).toContain('zostaje na kolejny okres');
    expect(correction?.sentence).not.toMatch(/wypłać|odbierz/i);
  });

  it('trafienie co do złotówki też ma swoje zdanie', () => {
    const correction = buildCorrection({
      profile: profile(),
      ledger: ledger({ alreadySetAside: 2_850 }),
      params: PARAMS,
    });
    expect(correction?.delta).toBe(0);
    expect(correction?.sentence).toContain('dokładnie tyle');
  });
});

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

describe('karta T-05', () => {
  const proposal = buildSetAsideProposal({
    tenantId: 't1',
    profile: profile(),
    ledger: ledger(),
    params: PARAMS,
    paymentAmount: 6_150,
    now: NOW,
  });

  it('jeden okres = jedna karta, aktualizowana po każdej wpłacie', () => {
    expect(proposal?.topicKey).toBe('tax.setaside:2026-09');
  });

  it('mówi, ile wpłynęło i ile z tego nie jest jeszcze klienta', () => {
    expect(proposal?.body).toContain(formatPln(6_150));
    expect(proposal?.body).toContain('reszta jest Twoja');
  });

  it('karta żyje do końca miesiąca — domknięcie przyniesie korektę', () => {
    expect(proposal?.expiresAt.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('kolejna wpłata zmienia odcisk danych', () => {
    const later = buildSetAsideProposal({
      tenantId: 't1',
      profile: profile(),
      ledger: ledger({ income: 26_150 }),
      params: PARAMS,
      paymentAmount: 6_150,
      now: NOW,
    });
    expect(later?.fingerprint).not.toBe(proposal?.fingerprint);
  });
});
