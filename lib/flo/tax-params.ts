/**
 * Parametry roczne i kalendarz terminów (krok 35 planu).
 *
 * ⚠️ WARTOŚCI WYMAGAJĄ POTWIERDZENIA PRZEZ CZŁOWIEKA — dokładnie tak samo
 * jak stawki odsetek w `lib/flo/interest.ts`.
 *
 * Limity, progi i terminy to DANE PRAWNE. Zmieniają się ustawą, a nie
 * decyzją programisty, i nie wolno brać ich z pamięci modelu językowego —
 * model potrafi podać liczbę, która była prawdziwa dwa lata temu, i zrobi
 * to z pełnym przekonaniem. Dlatego każdy wiersz ma pole `source`, a flaga
 * `PARAMS_VERIFIED` stoi na `false`, dopóki ktoś nie sprawdzi tabeli
 * w źródle urzędowym i nie przestawi jej świadomie, w commicie.
 *
 * ALGORYTMY NATOMIAST SĄ PRAWDZIWE. Wyznaczanie Wielkanocy, ruchome święta
 * i przesunięcie terminu na dzień roboczy to czysta arytmetyka kalendarza —
 * nie starzeje się i nie wymaga niczyjej zgody.
 *
 * BEZPIECZNIK WIEKU: `paramsStale()` psuje zestaw testów, gdy tabela nie
 * była przeglądana od roku. To celowe. Parametry podatkowe, o których
 * wszyscy zapomnieli, są gorsze od ich braku: brak widać od razu, a stara
 * liczba wygląda dokładnie tak samo jak świeża.
 */

// ═══════════════════════════════════════════════════════════════
// Bezpieczniki
// ═══════════════════════════════════════════════════════════════

/**
 * PRZESTAW NA `true` DOPIERO PO SPRAWDZENIU CAŁEJ TABELI W ŹRÓDLE URZĘDOWYM
 * i uzupełnieniu pól `source`. Dopóki jest `false`, grupa podatkowa milczy
 * niezależnie od tego, co ustawiono w `lib/flo/flags.ts`.
 */
export const PARAMS_VERIFIED = false;

/** Kiedy człowiek ostatni raz przejrzał tabelę poniżej (YYYY-MM-DD). */
export const PARAMS_REVIEWED_ON = '2026-08-29';

/** Po tylu dniach bez przeglądu tabela uchodzi za przeterminowaną. */
export const PARAMS_MAX_AGE_DAYS = 365;

const DAY_MS = 86_400_000;

export function paramsAgeDays(today: Date = new Date()): number {
  const reviewed = Date.parse(`${PARAMS_REVIEWED_ON}T00:00:00.000Z`);
  return Math.floor((today.getTime() - reviewed) / DAY_MS);
}

/** Pilnowane testem. Zielone dopóki ktoś przegląda tabelę raz do roku. */
export function paramsStale(today: Date = new Date()): boolean {
  return paramsAgeDays(today) > PARAMS_MAX_AGE_DAYS;
}

// ═══════════════════════════════════════════════════════════════
// Tabela parametrów
// ═══════════════════════════════════════════════════════════════

export interface TaxParams {
  /** Data, od której zestaw obowiązuje (YYYY-MM-DD). */
  validFrom: string;
  /** Limit zwolnienia podmiotowego z VAT, PLN. Podstawa licznika T-02. */
  vatExemptionLimit: number;
  /** Skala: stawka pierwszego progu (ułamek). */
  pitScaleLowRate: number;
  /** Skala: stawka powyżej progu (ułamek). */
  pitScaleHighRate: number;
  /** Skala: próg dochodu, PLN. */
  pitScaleThreshold: number;
  /** Skala: kwota wolna od podatku, PLN. */
  pitTaxFreeAmount: number;
  /** Podatek liniowy: stawka (ułamek). */
  pitFlatRate: number;
  /** Ulga na start: ile miesięcy bez składek społecznych. */
  reliefStartMonths: number;
  /** Preferencyjny ZUS: ile miesięcy po uldze na start. */
  reliefPreferentialMonths: number;
  /** Dzień miesiąca: JPK_V7 i zapłata VAT. */
  vatFilingDay: number;
  /** Dzień miesiąca: zaliczka na PIT. */
  pitAdvanceDay: number;
  /** Dzień miesiąca: składki ZUS przedsiębiorcy bez pracowników. */
  zusDay: number;
  /** Skąd wzięte wartości — PUSTE POLE OZNACZA WIERSZ NIESPRAWDZONY. */
  source: string;
}

/**
 * Zestawy posortowane rosnąco po dacie obowiązywania.
 *
 * Wartości poniżej są PLACEHOLDERAMI o prawdopodobnym rzędzie wielkości.
 * Służą do testowania algorytmów — kalendarza, proporcji, progów — a nie
 * do liczenia czegokolwiek klientowi. Patrz `PARAMS_VERIFIED`.
 */
export const TAX_PARAMS: readonly TaxParams[] = [
  {
    validFrom: '2026-01-01',
    vatExemptionLimit: 200_000,
    pitScaleLowRate: 0.12,
    pitScaleHighRate: 0.32,
    pitScaleThreshold: 120_000,
    pitTaxFreeAmount: 30_000,
    pitFlatRate: 0.19,
    reliefStartMonths: 6,
    reliefPreferentialMonths: 24,
    vatFilingDay: 25,
    pitAdvanceDay: 20,
    zusDay: 20,
    source: '',
  },
];

/**
 * Zestaw obowiązujący w danym dniu.
 *
 * Zwraca `null` dla dat sprzed pierwszego wiersza. Milczenie jest wtedy
 * jedyną uczciwą odpowiedzią: nie wiemy, jakie były wtedy limity, a
 * podstawienie najstarszego znanego zestawu byłoby zgadywaniem.
 */
export function paramsFor(date: Date): TaxParams | null {
  const stamp = date.getTime();
  let found: TaxParams | null = null;

  for (const row of TAX_PARAMS) {
    const from = Date.parse(`${row.validFrom}T00:00:00.000Z`);
    if (from <= stamp) found = row;
  }

  return found;
}

// ═══════════════════════════════════════════════════════════════
// Kalendarz dni wolnych
// ═══════════════════════════════════════════════════════════════

/**
 * Niedziela Wielkanocna — algorytm Meeusa/Jonesa/Butchera dla kalendarza
 * gregoriańskiego. Czysta arytmetyka, więc nie starzeje się razem z tabelą
 * parametrów; od niej liczą się trzy pozostałe święta ruchome.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

/** Święta o stałej dacie: [miesiąc, dzień]. */
const FIXED_HOLIDAYS: readonly [number, number][] = [
  [1, 1], // Nowy Rok
  [1, 6], // Trzech Króli
  [5, 1], // Święto Pracy
  [5, 3], // Święto Konstytucji
  [8, 15], // Wniebowzięcie / Wojska Polskiego
  [11, 1], // Wszystkich Świętych
  [11, 11], // Niepodległości
  [12, 25], // Boże Narodzenie
  [12, 26], // drugi dzień świąt
];

/** Dni wolne od pracy w danym roku, jako `YYYY-MM-DD`. */
export function holidaysOf(year: number): Set<string> {
  const days = new Set<string>();

  for (const [month, day] of FIXED_HOLIDAYS) {
    days.add(iso(new Date(Date.UTC(year, month - 1, day))));
  }

  const easter = easterSunday(year);
  // Wielkanoc, poniedziałek wielkanocny, Zielone Świątki, Boże Ciało.
  for (const offset of [0, 1, 49, 60]) {
    days.add(iso(new Date(easter.getTime() + offset * DAY_MS)));
  }

  return days;
}

export function isPublicHoliday(date: Date): boolean {
  return holidaysOf(date.getUTCFullYear()).has(iso(date));
}

export function isBusinessDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !isPublicHoliday(date);
}

/**
 * Przesunięcie na najbliższy dzień roboczy.
 *
 * Zawsze DO PRZODU. Termin, który wypada w sobotę, upływa w poniedziałek —
 * przesunięcie w tył kazałoby klientowi zapłacić wcześniej, niż musi, a to
 * nie jest rola programu.
 */
export function shiftToBusinessDay(date: Date): Date {
  let cursor = date;
  // Najdłuższy realny ciąg dni wolnych w Polsce to kilka dni; limit jest
  // wyłącznie zabezpieczeniem przed pętlą nieskończoną, gdyby kalendarz
  // kiedyś oszalał.
  for (let guard = 0; guard < 14; guard++) {
    if (isBusinessDay(cursor)) return cursor;
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return cursor;
}

// ═══════════════════════════════════════════════════════════════
// Terminy
// ═══════════════════════════════════════════════════════════════

export type TaxDeadlineKind = 'vat' | 'pit' | 'zus';

export interface TaxDeadline {
  kind: TaxDeadlineKind;
  /** Termin ustawowy przed przesunięciem, YYYY-MM-DD. */
  nominal: string;
  /** Termin faktyczny, po przesunięciu na dzień roboczy. */
  due: string;
  /** Czy przesunięcie w ogóle nastąpiło — do treści komunikatu. */
  shifted: boolean;
}

export interface DeadlineInput {
  kind: TaxDeadlineKind;
  /** Rok okresu rozliczeniowego. */
  year: number;
  /** Ostatni miesiąc okresu rozliczeniowego, 1–12. */
  month: number;
}

/**
 * Termin dla okresu rozliczeniowego — zawsze w miesiącu NASTĘPUJĄCYM po nim.
 *
 * Zwraca `null`, gdy dla tej daty nie znamy parametrów. Podanie terminu
 * „na oko" byłoby najgorszym możliwym błędem tej funkcji: klient zapłaciłby
 * za późno, ufając liczbie, której nikt nie sprawdził.
 */
export function taxDeadline(input: DeadlineInput): TaxDeadline | null {
  // Miesiąc następujący po okresie; przekroczenie grudnia obsługuje Date.UTC.
  const anchor = new Date(Date.UTC(input.year, input.month, 1));
  const params = paramsFor(anchor);
  if (!params) return null;

  const day =
    input.kind === 'vat'
      ? params.vatFilingDay
      : input.kind === 'pit'
        ? params.pitAdvanceDay
        : params.zusDay;

  const nominal = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), day),
  );
  const due = shiftToBusinessDay(nominal);

  return {
    kind: input.kind,
    nominal: iso(nominal),
    due: iso(due),
    shifted: iso(due) !== iso(nominal),
  };
}

/** Ostatni miesiąc kwartału, w którym leży podany miesiąc. */
export function quarterEndMonth(month: number): number {
  return Math.ceil(month / 3) * 3;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
