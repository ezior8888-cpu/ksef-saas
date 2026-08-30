/**
 * Helpery tekstowe i czasowe interfejsu agenta FLO (krok 1 toru B).
 *
 * DWIE ZASADY, KTÓRE TEN PLIK PILNUJE:
 *
 * 1. Interfejs NIGDY nie liczy ani nie formatuje liczb domenowych. Kwoty,
 *    tytuły i treści przychodzą z serwera jako gotowe napisy (`title`,
 *    `body`, `amount`, `total`). Tutaj nie ma i nie będzie funkcji
 *    formatującej złotówki — jeżeli kiedyś okaże się potrzebna, to znaczy,
 *    że czegoś brakuje w kontrakcie `FloProposalView`, a nie tutaj.
 *
 * 2. JEDYNY WYJĄTEK to czas. Serwer nie umie przysłać napisu „zostały
 *    4 minuty”, bo ten napis zmienia się co sekundę na ekranie klienta.
 *    Odliczanie do `expiresAt` i do `undoableUntil` liczy więc interfejs —
 *    i tylko to.
 *
 * TRZECIA RZECZ: granica doby liczona jest JAWNIE w strefie Europe/Warsaw.
 * Kontenery chodzą w UTC, klient żyje w Polsce. Zdarzenie o 00:30 czasu
 * polskiego to dla serwera 22:30 dnia poprzedniego — bez jawnej strefy
 * interfejs napisałby „WCZORAJ” nad czymś, co dla klienta stało się dziś
 * w nocy. Ten sam błąd złapał u siebie tor silnika (`lib/flo/fingerprint.ts`,
 * krok 10 Bartosza).
 */

import { countLabel, plural, type PluralForms } from '@/lib/i18n/plural';

/** Strefa klienta. Wszystkie etykiety dat i godzin liczymy w niej. */
export const FLO_TZ = 'Europe/Warsaw';

// ═══════════════════════════════════════════════════════════════
// Odmiana przez liczebnik
// ═══════════════════════════════════════════════════════════════

/**
 * Sama reguła odmiany mieszka w `lib/i18n/plural.ts` — jest wspólna dla
 * całej aplikacji, nie tylko dla agenta. Tutaj tylko ją przepuszczamy dalej,
 * żeby komponenty FLO miały jeden import.
 */
export { countLabel, plural, type PluralForms };

/**
 * Formy używane w interfejsie agenta. Trzymamy je tutaj, zamiast wpisywać
 * tablice w komponentach — literówka w odmianie ma wtedy jedno miejsce do
 * poprawienia.
 */
export const FLO_FORMS = {
  zadanie: ['zadanie', 'zadania', 'zadań'],
  sprawa: ['sprawa', 'sprawy', 'spraw'],
  propozycja: ['propozycja', 'propozycje', 'propozycji'],
  faktura: ['faktura', 'faktury', 'faktur'],
  pozycja: ['pozycja', 'pozycje', 'pozycji'],
  koszt: ['koszt', 'koszty', 'kosztów'],
  dzien: ['dzień', 'dni', 'dni'],
  godzina: ['godzina', 'godziny', 'godzin'],
  minuta: ['minuta', 'minuty', 'minut'],
  sekunda: ['sekunda', 'sekundy', 'sekund'],
  zaznaczona: ['zaznaczona', 'zaznaczone', 'zaznaczonych'],
} satisfies Record<string, PluralForms>;

/**
 * Czasownik „zostać” w komunikatach o pozostałym czasie. Odmienia się nie
 * tylko przez liczbę, ale i przez RODZAJ rzeczownika: „został 1 dzień”
 * (męski), ale „została 1 minuta” (żeński). Bez tego rozróżnienia agent
 * pisze „został 1 minuta” i od razu brzmi jak automat.
 */
const VERB_LEFT = {
  m: ['został', 'zostały', 'zostało'],
  f: ['została', 'zostały', 'zostało'],
} satisfies Record<'m' | 'f', PluralForms>;

/** Napis „zostały 4 minuty” — czasownik i rzeczownik odmienione razem. */
function leftPhrase(
  count: number,
  forms: PluralForms,
  gender: 'm' | 'f',
): string {
  return `${plural(count, VERB_LEFT[gender])} ${countLabel(count, forms)}`;
}

// ═══════════════════════════════════════════════════════════════
// Czas — odliczanie
// ═══════════════════════════════════════════════════════════════

/** Wynik odliczania do terminu. */
export interface FloTimeLeft {
  /** true = termin minął; karta pokazuje „nieaktualne”, nie znika sama */
  expired: boolean;
  /** pełne sekundy do terminu; 0 gdy minął */
  seconds: number;
  /** np. „zostały 4 minuty”, „został 1 dzień”, „termin minął” */
  label: string;
  /** krótka wersja do odznaki: „4 min”, „1 dz.”, „—” */
  short: string;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Ile zostało do terminu z pola `expiresAt` albo `undoableUntil`.
 *
 * `now` jest parametrem, a nie odczytem `Date.now()` w środku, z dwóch
 * powodów: test ma być powtarzalny, a lista kart trzyma jeden wspólny zegar
 * (jeden interwał na listę, nie jeden na kartę).
 */
export function timeLeft(iso: string, now: Date = new Date()): FloTimeLeft {
  const target = Date.parse(iso);

  if (Number.isNaN(target)) {
    // Zły znacznik czasu z serwera nie ma prawa wywalić listy kart.
    return { expired: true, seconds: 0, label: 'termin minął', short: '—' };
  }

  const seconds = Math.floor((target - now.getTime()) / 1000);

  if (seconds <= 0) {
    return { expired: true, seconds: 0, label: 'termin minął', short: '—' };
  }

  if (seconds < MINUTE) {
    return {
      expired: false,
      seconds,
      label: leftPhrase(seconds, FLO_FORMS.sekunda, 'f'),
      short: `${seconds} s`,
    };
  }

  if (seconds < HOUR) {
    const minutes = Math.floor(seconds / MINUTE);
    return {
      expired: false,
      seconds,
      label: leftPhrase(minutes, FLO_FORMS.minuta, 'f'),
      short: `${minutes} min`,
    };
  }

  if (seconds < DAY) {
    const hours = Math.floor(seconds / HOUR);
    return {
      expired: false,
      seconds,
      label: leftPhrase(hours, FLO_FORMS.godzina, 'f'),
      short: `${hours} godz.`,
    };
  }

  const days = Math.floor(seconds / DAY);
  return {
    expired: false,
    seconds,
    label: leftPhrase(days, FLO_FORMS.dzien, 'm'),
    short: `${days} dz.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Czas — etykiety dnia i godziny
// ═══════════════════════════════════════════════════════════════

const clockFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: FLO_TZ,
  hour: '2-digit',
  minute: '2-digit',
});

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: FLO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: FLO_TZ,
  weekday: 'long',
});

const dateFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: FLO_TZ,
  day: 'numeric',
  month: 'long',
});

/** Godzina zdarzenia w strefie klienta: „08:34”. Pusty napis przy złej dacie. */
export function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return clockFormat.format(date);
}

/** Dzień kalendarzowy w strefie klienta jako „2026-08-24”. */
function dayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

/** Ile dni kalendarzowych (w strefie klienta) dzieli dwie chwile. */
function dayDistance(a: Date, b: Date): number {
  const [ay, am, ad] = dayKey(a).split('-').map(Number);
  const [by, bm, bd] = dayKey(b).split('-').map(Number);
  return Math.round(
    (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / (DAY * 1000),
  );
}

/**
 * Nagłówek grupy na osi zdarzeń: „DZIŚ”, „WCZORAJ”, „JUTRO”, nazwa dnia
 * tygodnia w obrębie ostatniego tygodnia („ŚRODA”), dalej data
 * („12 SIERPNIA”).
 *
 * Grupowanie jest robotą interfejsu, bo zależy od tego, KIEDY klient patrzy
 * na ekran — serwer nie ma jak przysłać napisu, który jutro rano ma się sam
 * zmienić z „DZIŚ” na „WCZORAJ”.
 */
export function dayGroupLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const distance = dayDistance(now, date);

  if (distance === 0) return 'DZIŚ';
  if (distance === 1) return 'WCZORAJ';
  if (distance === -1) return 'JUTRO';
  if (distance > 1 && distance < 7) {
    return weekdayFormat.format(date).toUpperCase();
  }

  return dateFormat.format(date).toUpperCase();
}
