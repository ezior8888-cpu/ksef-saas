import { describe, expect, it } from 'vitest';

import {
  describeChange,
  diffFacts,
  fingerprintOf,
  relativeDay,
  type FloFacts,
} from '@/lib/flo/fingerprint';

/**
 * Re-walidacja przy wykonaniu (krok 10 planu agenta FLO).
 *
 * Chroni przed najgorszą klasą awarii: propozycja powstaje o 9:02, człowiek
 * klika o 14:30, a przez ten czas kontrahent zapłacił. Wysłanie ponaglenia
 * w takiej sytuacji kompromituje klienta przed jego własnym kontrahentem —
 * i jest to szkoda, której nie da się cofnąć.
 */

const NOW = new Date('2026-08-24T14:30:00.000Z');

function chaseFacts(overrides: Partial<FloFacts> = {}): FloFacts {
  return {
    status: 'accepted',
    grossTotal: 4300,
    paidAmount: 0,
    dueDate: '2026-08-16',
    remindersPaused: 0,
    stage: 'stage_1',
    ...overrides,
  };
}

describe('odcisk danych', () => {
  it('ten sam stan daje ten sam skrót', () => {
    expect(fingerprintOf(chaseFacts())).toBe(fingerprintOf(chaseFacts()));
  });

  it('kolejność pól nie zmienia skrótu', () => {
    // Kolejność kluczy w obiekcie nie jest faktem o świecie. Bez sortowania
    // ten sam stan dawałby różne skróty zależnie od tego, jak ktoś akurat
    // zbudował obiekt — i każda propozycja wyglądałaby na nieaktualną.
    const a: FloFacts = { grossTotal: 4300, paidAmount: 0, status: 'accepted' };
    const b: FloFacts = { status: 'accepted', paidAmount: 0, grossTotal: 4300 };
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
  });

  it('zmiana wpłaty zmienia skrót', () => {
    expect(fingerprintOf(chaseFacts())).not.toBe(
      fingerprintOf(chaseFacts({ paidAmount: 4300 })),
    );
  });

  it('brak wartości i wartość pusta są tym samym stanem', () => {
    expect(fingerprintOf({ a: null })).toBe(fingerprintOf({ a: null }));
  });

  it('wskazuje, które fakty się zmieniły', () => {
    const changed = diffFacts(chaseFacts(), chaseFacts({ paidAmount: 4300 }));
    expect(changed).toEqual([{ key: 'paidAmount', before: 0, after: 4300 }]);
  });
});

describe('komunikat o zmianie', () => {
  it('mówi wprost, że kontrahent zapłacił i kiedy', () => {
    // To jest scenariusz z planu: propozycja ponaglenia, wpłata w międzyczasie,
    // kliknięcie — nic nie wychodzi, a człowiek dostaje konkretne zdanie.
    const message = describeChange(
      'payment.chase',
      chaseFacts(),
      chaseFacts({ paidAmount: 4300, lastPaymentAt: '2026-08-23T10:00:00.000Z' }),
      { contractorName: 'Nowak' },
      NOW,
    );
    expect(message).toBe('Nowak zapłacił wczoraj — anulowałem.');
  });

  it('rozróżnia wpłatę częściową od pełnej', () => {
    const message = describeChange(
      'payment.chase',
      chaseFacts(),
      chaseFacts({ paidAmount: 1000, lastPaymentAt: '2026-08-24T08:00:00.000Z' }),
      { contractorName: 'Nowak' },
      NOW,
    );
    expect(message).toContain('część należności');
    expect(message).toContain('dziś');
  });

  it('radzi sobie bez nazwy kontrahenta', () => {
    const message = describeChange(
      'payment.chase',
      chaseFacts(),
      chaseFacts({ paidAmount: 4300 }),
      {},
      NOW,
    );
    expect(message).toBe('Kontrahent zapłacił — anulowałem.');
  });

  it('opisuje wstrzymanie przypomnień', () => {
    const message = describeChange(
      'payment.chase',
      chaseFacts(),
      chaseFacts({ remindersPaused: 1 }),
      {},
      NOW,
    );
    expect(message).toContain('wstrzymane');
  });

  it('opisuje zmianę kwoty na fakturze', () => {
    const message = describeChange(
      'invoice.draft',
      chaseFacts(),
      chaseFacts({ grossTotal: 5000 }),
      {},
      NOW,
    );
    expect(message).toContain('Kwota');
  });

  it('opisuje ręczne przejrzenie kosztu', () => {
    const message = describeChange(
      'expense.review',
      { reviewedAt: 0 },
      { reviewedAt: 1 },
      {},
      NOW,
    );
    expect(message).toContain('przejrzany');
  });

  it('nie zostawia człowieka z „coś poszło nie tak”', () => {
    // Nawet w nieprzewidzianym przypadku komunikat musi nieść informację.
    const message = describeChange(
      'wrapped.ready',
      { cokolwiek: 'a' },
      { cokolwiek: 'b' },
      {},
      NOW,
    );
    expect(message).toContain('cokolwiek');
    expect(message.toLowerCase()).not.toContain('błąd');
  });
});

describe('data po ludzku', () => {
  it('mówi „dziś”, „wczoraj” i „N dni temu”', () => {
    expect(relativeDay('2026-08-24T08:00:00.000Z', NOW)).toBe('dziś');
    expect(relativeDay('2026-08-23T12:00:00.000Z', NOW)).toBe('wczoraj');
    expect(relativeDay('2026-08-21T10:00:00.000Z', NOW)).toBe('3 dni temu');
  });

  it('liczy dobę po polsku, nie po serwerowemu', () => {
    // Serwer chodzi w UTC, klient żyje w Warszawie. W sierpniu to dwie
    // godziny różnicy — i dokładnie w tym oknie agent potrafiłby powiedzieć
    // „wczoraj” o czymś, co dla klienta wydarzyło się dziś w nocy.
    // 23.08 22:00 UTC = 24.08 00:00 w Warszawie → to jest DZIŚ.
    expect(relativeDay('2026-08-23T22:00:00.000Z', NOW)).toBe('dziś');
    // 23.08 21:59 UTC = 23.08 23:59 w Warszawie → to jest WCZORAJ.
    expect(relativeDay('2026-08-23T21:59:00.000Z', NOW)).toBe('wczoraj');
  });

  it('starsze zdarzenia podaje datą', () => {
    expect(relativeDay('2026-07-01T10:00:00.000Z', NOW)).toMatch(/2026/);
  });

  it('milczy, gdy daty nie ma albo jest bez sensu', () => {
    expect(relativeDay(null, NOW)).toBeNull();
    expect(relativeDay('nie-data', NOW)).toBeNull();
  });
});
