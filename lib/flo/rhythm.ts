/**
 * P-01 — wykrywanie rytmu fakturowania (krok 31 planu).
 *
 * Agent zauważa, że Kamil dostaje fakturę co miesiąc około dziesiątego, na
 * podobną kwotę i za te same pozycje. To jest fundament całej grupy
 * przychodowej: bez wiarygodnego profilu paczka szkiców (P-02) i alarm
 * o brakującej fakturze (P-03) byłyby zgadywaniem.
 *
 * TRZY AWARIE, KTÓRE PROJEKT ZAMYKA:
 *
 * 1. RYTM Z PRZYPADKU. Trzy jednorazowe zlecenia dla tej samej firmy
 *    w odstępach zbliżonych do miesiąca. Statystyka widzi stałą współpracę
 *    tam, gdzie jej nie ma, klient dostaje szkice, których nikt nie zamawiał,
 *    i przestaje ufać KAŻDEJ propozycji — także tym trafnym. Dlatego profil
 *    wymaga TRZECH WARUNKÓW NARAZ i rodzi się jako „kandydat", którego
 *    człowiek musi raz potwierdzić.
 *
 * 2. RYTM SIĘ ZMIENIŁ. Klient przeszedł na kwartalny albo współpraca cicho
 *    wygasła. Agent, który dalej dowozi szkice, jest ozdobą, nie pomocą —
 *    a to gorsze niż brak funkcji. Dwa pominięte cykle usypiają profil BEZ
 *    ŻADNEGO KOMUNIKATU: to nie jest sprawa, o której trzeba rozmawiać.
 *
 * 3. DZIAŁALNOŚĆ SEZONOWA. Fotograf ślubny, firma remontowa, księgowa
 *    w sezonie rozliczeń. Mediana odstępu nie opisuje wtedy niczego. Przy
 *    dużym rozrzucie profil NIE POWSTAJE W OGÓLE — nie powstaje „z
 *    zastrzeżeniem". Sezonowość to osobne pytanie i osobne dane: dwa pełne
 *    lata, żeby w ogóle dało się mówić o powtarzalności miesięcy.
 */

// ═══════════════════════════════════════════════════════════════
// Progi
// ═══════════════════════════════════════════════════════════════

/** Mniej faktur i nie ma o czym mówić. */
export const MIN_INVOICES = 3;

/** Rozrzut odstępów powyżej tego ułamka mediany = brak rytmu. */
export const MAX_INTERVAL_SPREAD = 0.25;

/** Podobieństwo nazw pozycji poniżej tego progu = to nie jest ta sama usługa. */
export const MIN_ITEM_SIMILARITY = 0.8;

/** Po tylu pominiętych cyklach profil zasypia. */
export const DORMANT_AFTER_MISSED = 2;

/** Sezonowość wymaga dwóch pełnych lat — inaczej to nie jest wzorzec. */
export const SEASONAL_MIN_YEARS = 2;

export interface InvoiceForRhythm {
  id: string;
  /** YYYY-MM-DD */
  issueDate: string;
  grossTotal: number;
  /** Nazwy pozycji z faktury, do porównania „czy to ta sama usługa". */
  itemNames: string[];
}

export type ProfileState =
  /** Wykryty, ale niepotwierdzony przez człowieka. */
  | 'candidate'
  /** Potwierdzony — wolno na nim budować szkice. */
  | 'confirmed'
  /** Uśpiony po pominiętych cyklach. */
  | 'dormant';

export interface RhythmProfile {
  contractorKey: string;
  state: ProfileState;
  /** Mediana odstępu w dniach. */
  medianIntervalDays: number;
  /** Typowy dzień miesiąca wystawienia. */
  typicalDayOfMonth: number;
  /** Mediana kwoty brutto. */
  typicalAmount: number;
  sample: number;
  /** Data ostatniej faktury (YYYY-MM-DD). */
  lastInvoiceDate: string;
}

export type RhythmVerdict =
  | { kind: 'profile'; profile: Omit<RhythmProfile, 'contractorKey' | 'state'> }
  | { kind: 'none'; reason: 'too_few' | 'irregular' | 'different_items' };

// ═══════════════════════════════════════════════════════════════
// Wykrywanie — funkcja czysta
// ═══════════════════════════════════════════════════════════════

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż0-9\s]/g, '')
    .trim();
}

/**
 * Podobieństwo zestawów pozycji — udział wspólnych nazw.
 *
 * Nie chodzi o identyczność: „Usługi programistyczne" i „Usługi
 * programistyczne — sierpień" to ta sama usługa. Chodzi o to, żeby „projekt
 * logo" i „opieka nad serwerem" nie zlały się w jeden rytm tylko dlatego,
 * że wystawione tej samej firmie w podobnych odstępach.
 */
export function itemSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map(normalizeName).filter(Boolean));
  const setB = new Set(b.map(normalizeName).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const name of setA) {
    for (const other of setB) {
      if (name === other || name.includes(other) || other.includes(name)) {
        shared++;
        break;
      }
    }
  }

  return shared / Math.max(setA.size, setB.size);
}

/**
 * Czy z tych faktur wynika rytm.
 *
 * TRZY WARUNKI NARAZ. Każdy z osobna daje fałszywe trafienia: sama liczba
 * faktur nie odróżnia abonamentu od trzech zleceń, sam odstęp nie odróżnia
 * współpracy od zbiegu okoliczności, a same pozycje nie mówią nic o rytmie.
 */
export function detectRhythm(
  invoices: readonly InvoiceForRhythm[],
): RhythmVerdict {
  if (invoices.length < MIN_INVOICES) {
    return { kind: 'none', reason: 'too_few' };
  }

  const sorted = [...invoices].sort((a, b) =>
    a.issueDate.localeCompare(b.issueDate),
  );

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = Date.parse(sorted[i - 1]!.issueDate);
    const current = Date.parse(sorted[i]!.issueDate);
    intervals.push(Math.round((current - previous) / 86_400_000));
  }

  const medianInterval = median(intervals);
  if (medianInterval <= 0) return { kind: 'none', reason: 'irregular' };

  // Warunek drugi: rozrzut. Przy działalności sezonowej odstępy skaczą
  // od kilkunastu dni do pół roku i mediana nie opisuje niczego.
  const maxDeviation = Math.max(
    ...intervals.map((value) => Math.abs(value - medianInterval)),
  );
  if (maxDeviation / medianInterval > MAX_INTERVAL_SPREAD) {
    return { kind: 'none', reason: 'irregular' };
  }

  // Warunek trzeci: to musi być ta sama usługa, nie tylko ta sama firma.
  const first = sorted[0]!;
  const similarities = sorted
    .slice(1)
    .map((invoice) => itemSimilarity(first.itemNames, invoice.itemNames));
  const worstSimilarity = Math.min(...similarities);

  if (worstSimilarity < MIN_ITEM_SIMILARITY) {
    return { kind: 'none', reason: 'different_items' };
  }

  return {
    kind: 'profile',
    profile: {
      medianIntervalDays: medianInterval,
      typicalDayOfMonth: median(
        sorted.map((invoice) => Number(invoice.issueDate.slice(8, 10))),
      ),
      typicalAmount: median(sorted.map((invoice) => invoice.grossTotal)),
      sample: sorted.length,
      lastInvoiceDate: sorted[sorted.length - 1]!.issueDate,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Cykl życia profilu
// ═══════════════════════════════════════════════════════════════

/**
 * Ile cykli minęło bez faktury.
 *
 * Liczone w cyklach, nie w dniach: przy rytmie kwartalnym miesiąc zwłoki
 * to nic, przy miesięcznym — sygnał.
 */
export function missedCycles(profile: RhythmProfile, now: Date): number {
  const last = Date.parse(profile.lastInvoiceDate);
  if (Number.isNaN(last) || profile.medianIntervalDays <= 0) return 0;
  const elapsed = (now.getTime() - last) / 86_400_000;
  return Math.max(0, Math.floor(elapsed / profile.medianIntervalDays) - 1);
}

/**
 * Następny stan profilu.
 *
 * Uśpienie jest CICHE. Agent nie ogłasza, że przestaje pilnować — to nie
 * jest sprawa, o której trzeba rozmawiać, a komunikat „usypiam profil"
 * brzmiałby jak przypomnienie o straconym kliencie.
 */
export function nextProfileState(
  profile: RhythmProfile,
  now: Date,
): ProfileState {
  if (profile.state === 'dormant') return 'dormant';
  return missedCycles(profile, now) >= DORMANT_AFTER_MISSED
    ? 'dormant'
    : profile.state;
}

/**
 * Czy wolno na tym profilu budować szkice faktur.
 *
 * Tylko potwierdzony. „Kandydat" oznacza, że agent coś zauważył, ale nie
 * ma prawa działać na podstawie własnego domysłu — pierwsze użycie musi
 * potwierdzić człowiek.
 */
export function canGenerateDrafts(profile: RhythmProfile, now: Date): boolean {
  return profile.state === 'confirmed' && nextProfileState(profile, now) !== 'dormant';
}

// ═══════════════════════════════════════════════════════════════
// Sezonowość — osobna sprawa i osobne dane
// ═══════════════════════════════════════════════════════════════

export interface SeasonalPattern {
  /** Miesiące (1-12), w których koszt albo przychód realnie występuje. */
  activeMonths: number[];
  yearsObserved: number;
}

/**
 * Wykrywa sezonowość — ale dopiero przy DWÓCH PEŁNYCH LATACH.
 *
 * Jeden rok to nie wzorzec, tylko opis zeszłego roku. Fotograf ślubny,
 * który miał jedno lato, nie dowiódł jeszcze niczego — a agent budujący
 * na tym przewidywania byłby zgadywaniem z ładnym wykresem.
 */
export function detectSeasonality(
  invoices: readonly InvoiceForRhythm[],
): SeasonalPattern | null {
  const byYear = new Map<number, Set<number>>();

  for (const invoice of invoices) {
    const year = Number(invoice.issueDate.slice(0, 4));
    const month = Number(invoice.issueDate.slice(5, 7));
    if (!Number.isInteger(year) || !Number.isInteger(month)) continue;
    byYear.set(year, (byYear.get(year) ?? new Set()).add(month));
  }

  if (byYear.size < SEASONAL_MIN_YEARS) return null;

  const years = [...byYear.values()];
  const common = [...years[0]!].filter((month) =>
    years.every((set) => set.has(month)),
  );

  // Powtarzalność musi obejmować wyraźnie mniej niż cały rok — inaczej to
  // nie jest sezon, tylko normalna, ciągła praca.
  if (common.length === 0 || common.length > 8) return null;

  return { activeMonths: common.sort((a, b) => a - b), yearsObserved: byYear.size };
}
