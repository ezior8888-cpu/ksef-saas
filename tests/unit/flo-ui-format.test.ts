import { describe, expect, it } from 'vitest';

import {
  clockLabel,
  countLabel,
  dayGroupLabel,
  FLO_FORMS,
  plural,
  timeLeft,
} from '@/components/flo/format';

/**
 * Helpery interfejsu agenta (krok 1 toru B).
 *
 * Dwie rzeczy, których pilnują te testy:
 * 1. odmiana przez liczebnik jest liczona regułą, nie „na oko” — w tym
 *    pułapka nastolatków (12–14) i zero;
 * 2. granica doby biegnie w strefie Europe/Warsaw, a nie w strefie serwera.
 *    Kontenery chodzą w UTC — bez tego nagłówek nad nocnym zdarzeniem
 *    mówiłby „WCZORAJ” o czymś, co dla klienta stało się dziś w nocy.
 */

describe('plural — odmiana przez liczebnik', () => {
  it('daje formę pojedynczą tylko dla 1', () => {
    expect(plural(1, FLO_FORMS.zadanie)).toBe('zadanie');
    expect(plural(21, FLO_FORMS.zadanie)).toBe('zadań');
  });

  it('daje formę 2–4 dla końcówek 2, 3, 4', () => {
    expect(plural(2, FLO_FORMS.zadanie)).toBe('zadania');
    expect(plural(4, FLO_FORMS.zadanie)).toBe('zadania');
    expect(plural(22, FLO_FORMS.faktura)).toBe('faktury');
    expect(plural(104, FLO_FORMS.pozycja)).toBe('pozycje');
  });

  it('nie daje się nabrać na nastolatków 12–14', () => {
    expect(plural(12, FLO_FORMS.zadanie)).toBe('zadań');
    expect(plural(13, FLO_FORMS.zadanie)).toBe('zadań');
    expect(plural(14, FLO_FORMS.zadanie)).toBe('zadań');
    expect(plural(112, FLO_FORMS.faktura)).toBe('faktur');
  });

  it('dla zera daje formę mnogą dopełniaczową', () => {
    expect(plural(0, FLO_FORMS.zadanie)).toBe('zadań');
    expect(countLabel(0, FLO_FORMS.zadanie)).toBe('0 zadań');
  });

  it('skleja liczbę z formą', () => {
    expect(countLabel(1, FLO_FORMS.zadanie)).toBe('1 zadanie');
    expect(countLabel(3, FLO_FORMS.propozycja)).toBe('3 propozycje');
    expect(countLabel(22, FLO_FORMS.faktura)).toBe('22 faktury');
    expect(countLabel(10, FLO_FORMS.pozycja)).toBe('10 pozycji');
  });
});

describe('timeLeft — odliczanie do terminu', () => {
  const now = new Date('2026-08-24T10:00:00.000Z');
  const at = (offsetSeconds: number) =>
    new Date(now.getTime() + offsetSeconds * 1000).toISOString();

  it('sekundy, minuty, godziny, dni — z poprawnym czasownikiem', () => {
    // Rodzaj ma znaczenie: „została 1 minuta”, ale „został 1 dzień”.
    expect(timeLeft(at(1), now).label).toBe('została 1 sekunda');
    expect(timeLeft(at(42), now).label).toBe('zostały 42 sekundy');
    expect(timeLeft(at(4 * 60), now).label).toBe('zostały 4 minuty');
    expect(timeLeft(at(60 * 60), now).label).toBe('została 1 godzina');
    expect(timeLeft(at(5 * 60 * 60), now).label).toBe('zostało 5 godzin');
    expect(timeLeft(at(48 * 60 * 60), now).label).toBe('zostały 2 dni');
  });

  it('krótka wersja do odznaki', () => {
    expect(timeLeft(at(4 * 60), now).short).toBe('4 min');
    expect(timeLeft(at(3 * 60 * 60), now).short).toBe('3 godz.');
    expect(timeLeft(at(72 * 60 * 60), now).short).toBe('3 dz.');
  });

  it('termin, który właśnie minął, jest wygasły', () => {
    expect(timeLeft(at(0), now)).toMatchObject({ expired: true, seconds: 0 });
    expect(timeLeft(at(-1), now).label).toBe('termin minął');
  });

  it('zły znacznik czasu nie wywala listy, tylko wygasza kartę', () => {
    expect(timeLeft('to nie jest data', now)).toMatchObject({
      expired: true,
      short: '—',
    });
  });
});

describe('etykiety dnia i godziny — strefa Europe/Warsaw', () => {
  it('godzina jest liczona w strefie klienta, nie serwera', () => {
    // 06:34 UTC = 08:34 w Warszawie (czas letni)
    expect(clockLabel('2026-08-24T06:34:00.000Z')).toBe('08:34');
  });

  it('zdarzenie z nocy należy do polskiego „dziś”, nie do wczoraj', () => {
    // 22:30 UTC 24.08 = 00:30 dnia 25.08 w Warszawie
    const nocne = '2026-08-24T22:30:00.000Z';
    const rano = new Date('2026-08-25T06:00:00.000Z');
    expect(dayGroupLabel(nocne, rano)).toBe('DZIŚ');
  });

  it('dziś, wczoraj, jutro', () => {
    const now = new Date('2026-08-24T10:00:00.000Z');
    expect(dayGroupLabel('2026-08-24T14:31:00.000Z', now)).toBe('DZIŚ');
    expect(dayGroupLabel('2026-08-23T14:31:00.000Z', now)).toBe('WCZORAJ');
    expect(dayGroupLabel('2026-08-25T06:00:00.000Z', now)).toBe('JUTRO');
  });

  it('w obrębie tygodnia nazwa dnia, dalej data', () => {
    const now = new Date('2026-08-24T10:00:00.000Z');
    expect(dayGroupLabel('2026-08-20T10:00:00.000Z', now)).toBe('CZWARTEK');
    expect(dayGroupLabel('2026-08-12T10:00:00.000Z', now)).toBe('12 SIERPNIA');
  });

  it('zła data daje pusty napis, a nie „Invalid Date”', () => {
    expect(clockLabel('nonsens')).toBe('');
    expect(dayGroupLabel('nonsens')).toBe('');
  });
});
