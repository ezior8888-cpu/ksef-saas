import { describe, expect, it } from 'vitest';

import {
  canGenerateDrafts,
  detectRhythm,
  detectSeasonality,
  DORMANT_AFTER_MISSED,
  itemSimilarity,
  missedCycles,
  nextProfileState,
  type InvoiceForRhythm,
  type RhythmProfile,
} from '@/lib/flo/rhythm';

/**
 * P-01 — wykrywanie rytmu fakturowania (krok 31).
 *
 * To jest fundament grupy przychodowej: fałszywy profil oznacza szkice
 * faktur, których nikt nie zamawiał, a po nich utratę zaufania do KAŻDEJ
 * propozycji agenta — także tych trafnych.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

function inv(
  issueDate: string,
  grossTotal = 22140,
  itemNames = ['Usługi programistyczne'],
): InvoiceForRhythm {
  return { id: issueDate, issueDate, grossTotal, itemNames };
}

describe('P-01 — trzy warunki naraz', () => {
  it('regularna współpraca daje profil', () => {
    const verdict = detectRhythm([
      inv('2026-05-10'),
      inv('2026-06-10'),
      inv('2026-07-10'),
      inv('2026-08-10'),
    ]);

    expect(verdict.kind).toBe('profile');
    if (verdict.kind === 'profile') {
      expect(verdict.profile.medianIntervalDays).toBeGreaterThanOrEqual(30);
      expect(verdict.profile.typicalDayOfMonth).toBe(10);
      expect(verdict.profile.typicalAmount).toBe(22140);
    }
  });

  it('AWARIA 1: trzy jednorazowe zlecenia to NIE jest rytm', () => {
    // Odstępy zbliżone do miesiąca, ale każde zlecenie inne. Bez warunku
    // podobieństwa pozycji agent zacząłby dowozić szkice, których nikt nie
    // zamawiał — i stracił zaufanie także do tych trafnych.
    const verdict = detectRhythm([
      inv('2026-05-10', 5000, ['Projekt logo']),
      inv('2026-06-12', 8000, ['Opieka nad serwerem']),
      inv('2026-07-11', 3000, ['Szkolenie zespołu']),
    ]);

    expect(verdict.kind).toBe('none');
    if (verdict.kind === 'none') expect(verdict.reason).toBe('different_items');
  });

  it('dwie faktury to za mało', () => {
    const verdict = detectRhythm([inv('2026-07-10'), inv('2026-08-10')]);
    expect(verdict).toMatchObject({ kind: 'none', reason: 'too_few' });
  });

  it('AWARIA 3: przy dużym rozrzucie profil NIE POWSTAJE W OGÓLE', () => {
    // Fotograf ślubny: kilka faktur latem, cisza zimą. Mediana odstępu nie
    // opisuje niczego, a profil „z zastrzeżeniem" byłby gorszy od jego braku.
    const verdict = detectRhythm([
      inv('2026-06-01'),
      inv('2026-06-20'),
      inv('2026-07-05'),
      inv('2026-12-15'),
    ]);

    expect(verdict).toMatchObject({ kind: 'none', reason: 'irregular' });
  });

  it('drobne wahania terminu nie psują profilu', () => {
    // Faktura wystawiona 10., 12. i 9. to nadal ten sam rytm. Wymaganie
    // co do dnia sprawiłoby, że funkcja nie działałaby u nikogo.
    const verdict = detectRhythm([
      inv('2026-05-10'),
      inv('2026-06-12'),
      inv('2026-07-09'),
      inv('2026-08-11'),
    ]);
    expect(verdict.kind).toBe('profile');
  });
});

describe('P-01 — podobieństwo pozycji', () => {
  it('ta sama usługa z dopiskiem miesiąca to nadal ta sama usługa', () => {
    expect(
      itemSimilarity(
        ['Usługi programistyczne'],
        ['Usługi programistyczne — sierpień'],
      ),
    ).toBeGreaterThanOrEqual(0.8);
  });

  it('inna usługa to inna usługa', () => {
    expect(itemSimilarity(['Projekt logo'], ['Opieka nad serwerem'])).toBe(0);
  });

  it('pusty zestaw nie udaje podobieństwa', () => {
    expect(itemSimilarity([], ['cokolwiek'])).toBe(0);
  });
});

describe('P-01 — cykl życia profilu', () => {
  function profile(overrides: Partial<RhythmProfile> = {}): RhythmProfile {
    return {
      contractorKey: 'acme',
      state: 'confirmed',
      medianIntervalDays: 30,
      typicalDayOfMonth: 10,
      typicalAmount: 22140,
      sample: 4,
      lastInvoiceDate: '2026-08-10',
      ...overrides,
    };
  }

  it('AWARIA 2: dwa pominięte cykle usypiają profil', () => {
    // Klient przeszedł na kwartalny albo współpraca wygasła. Agent, który
    // dalej dowozi szkice, jest ozdobą, nie pomocą.
    const stale = profile({ lastInvoiceDate: '2026-05-10' });
    expect(missedCycles(stale, NOW)).toBeGreaterThanOrEqual(
      DORMANT_AFTER_MISSED,
    );
    expect(nextProfileState(stale, NOW)).toBe('dormant');
  });

  it('jeden pominięty cykl jeszcze nie usypia', () => {
    const recent = profile({ lastInvoiceDate: '2026-07-10' });
    expect(nextProfileState(recent, NOW)).toBe('confirmed');
  });

  it('uśpiony zostaje uśpiony', () => {
    expect(nextProfileState(profile({ state: 'dormant' }), NOW)).toBe('dormant');
  });

  it('KANDYDAT nie generuje szkiców — pierwsze użycie potwierdza człowiek', () => {
    // Agent coś zauważył, ale nie ma prawa działać na podstawie własnego
    // domysłu.
    expect(canGenerateDrafts(profile({ state: 'candidate' }), NOW)).toBe(false);
    expect(canGenerateDrafts(profile(), NOW)).toBe(true);
  });

  it('uśpiony profil nie generuje szkiców, choćby był potwierdzony', () => {
    expect(
      canGenerateDrafts(profile({ lastInvoiceDate: '2026-04-10' }), NOW),
    ).toBe(false);
  });

  it('rytm kwartalny nie zasypia po miesiącu zwłoki', () => {
    // Liczymy w cyklach, nie w dniach: przy kwartale miesiąc zwłoki to nic.
    const quarterly = profile({
      medianIntervalDays: 90,
      lastInvoiceDate: '2026-06-10',
    });
    expect(nextProfileState(quarterly, NOW)).toBe('confirmed');
  });
});

describe('P-01 — sezonowość to osobna sprawa', () => {
  it('jeden rok to NIE jest wzorzec', () => {
    // Fotograf, który miał jedno lato, nie dowiódł jeszcze niczego.
    const oneYear = [
      inv('2026-06-01'),
      inv('2026-07-01'),
      inv('2026-08-01'),
    ];
    expect(detectSeasonality(oneYear)).toBeNull();
  });

  it('dwa lata z tymi samymi miesiącami dają wzorzec', () => {
    const pattern = detectSeasonality([
      inv('2025-06-01'),
      inv('2025-07-01'),
      inv('2026-06-15'),
      inv('2026-07-20'),
    ])!;

    expect(pattern.activeMonths).toEqual([6, 7]);
    expect(pattern.yearsObserved).toBe(2);
  });

  it('praca przez cały rok to nie sezon', () => {
    const allYear = Array.from({ length: 24 }, (_, i) => {
      const year = 2025 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, '0');
      return inv(`${year}-${month}-10`);
    });
    expect(detectSeasonality(allYear)).toBeNull();
  });

  it('brak wspólnych miesięcy to brak wzorca', () => {
    expect(
      detectSeasonality([inv('2025-03-01'), inv('2026-09-01')]),
    ).toBeNull();
  });
});
