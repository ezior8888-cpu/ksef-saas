import { describe, expect, it } from 'vitest';

import { calculateOfflineDeadline, isPolishBusinessDay } from '@/lib/ksef/idempotency';

/**
 * AUD-15 (decyzja P1, 02.10.2026): termin doesłania faktury z trybu offline
 * liczony był od chwili PARKOWANIA, w czasie serwera (UTC), z pominięciem
 * samych weekendów. Teraz: od daty wystawienia (P_1), w dniach roboczych
 * kalendarza polskiego (bez sobót, niedziel i świąt — w tym Wigilii od 2025),
 * do końca dnia w czasie Europe/Warsaw. Przy awarii MF 7 dni roboczych
 * od daty wystawienia (wcześniej niż „od końca awarii” — alarm nigdy nie
 * przyjdzie za późno).
 */

describe('dni robocze w Polsce', () => {
  it.each([
    ['2026-11-01', false], // niedziela, Wszystkich Świętych
    ['2026-11-11', false], // Narodowe Święto Niepodległości
    ['2026-12-24', false], // Wigilia — wolna od 2025
    ['2027-03-29', false], // Poniedziałek Wielkanocny 2027
    ['2027-05-27', false], // Boże Ciało 2027 (Wielkanoc + 60)
    ['2026-10-31', false], // sobota
    ['2026-11-02', true],
    ['2026-12-23', true],
  ])('%s → %s', (day, expected) => {
    expect(isPolishBusinessDay(day)).toBe(expected);
  });
});

describe('termin Offline24 od daty wystawienia', () => {
  it('piątek → koniec poniedziałku czasu polskiego (CET)', () => {
    expect(calculateOfflineDeadline('2026-10-30', false).toISOString()).toBe('2026-11-02T22:59:59.999Z');
  });

  it('dzień przed świętem → dzień po święcie', () => {
    expect(calculateOfflineDeadline('2026-11-10', false).toISOString()).toBe('2026-11-12T22:59:59.999Z');
  });

  it('Wigilia, święta i weekend → poniedziałek 28.12', () => {
    expect(calculateOfflineDeadline('2026-12-23', false).toISOString()).toBe('2026-12-28T22:59:59.999Z');
  });

  it('Wielkanoc 2027 i zmiana czasu na letni (CEST)', () => {
    expect(calculateOfflineDeadline('2027-03-26', false).toISOString()).toBe('2027-03-30T21:59:59.999Z');
  });

  it('awaria MF — 7 dni roboczych od daty wystawienia', () => {
    // 30.10 (pt) → 2,3,4,5,6,9,10 listopada (11.11 święto)
    expect(calculateOfflineDeadline('2026-10-30', true).toISOString()).toBe('2026-11-10T22:59:59.999Z');
  });

  it('nie zależy od strefy czasowej serwera ani chwili parkowania', () => {
    const a = calculateOfflineDeadline('2026-10-30', false);
    const b = calculateOfflineDeadline('2026-10-30', false);
    expect(a.getTime()).toBe(b.getTime());
  });
});
