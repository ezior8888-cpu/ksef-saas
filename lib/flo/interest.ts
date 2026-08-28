/**
 * K-05 — odsetki do wezwania o zapłatę (krok 24 planu).
 *
 * ⚠️ STAWKI WYMAGAJĄ POTWIERDZENIA PRZEZ CZŁOWIEKA.
 *
 * Algorytm jest przetestowany na złotym zbiorze i liczy poprawnie to, co mu
 * się poda. Ale WARTOŚCI STÓP poniżej to dane prawne, które zmieniają się
 * decyzjami Rady Polityki Pieniężnej i obwieszczeniami ministra — i których
 * nie wolno przyjmować z pamięci modelu. Dlatego flaga `RATES_VERIFIED`
 * stoi na `false`, a `shouldOfferInterest()` zwraca `false`, dopóki ktoś
 * nie sprawdzi tabeli i nie przestawi flagi świadomie.
 *
 * Do zweryfikowania przy okazji rozmowy z księgową albo prawnikiem
 * (bramka prawna, część VI.2 planu). Do tego czasu funkcja jest w kodzie,
 * przetestowana i wyłączona — co jest uczciwsze niż wyliczanie klientowi
 * kwoty, której nie umiemy obronić.
 *
 * DWA RODZAJE ODSETEK, KTÓRYCH NIE WOLNO MYLIĆ:
 * - ustawowe za opóźnienie — gdy dłużnikiem jest konsument,
 * - w transakcjach handlowych — gdy obie strony to firmy; wyższe.
 * Wybór wynika z tego, KIM jest kontrahent, a nie z tego, co jest korzystniejsze.
 */

// ═══════════════════════════════════════════════════════════════
// Tabela stóp
// ═══════════════════════════════════════════════════════════════

/**
 * PRZESTAW NA `true` DOPIERO PO SPRAWDZENIU STAWEK W ŹRÓDLE URZĘDOWYM.
 * Dopóki jest `false`, agent nie proponuje odsetek nikomu.
 */
export const RATES_VERIFIED = false;

export type InterestKind = 'statutory_late' | 'commercial';

export interface InterestRate {
  /** Data, od której stawka obowiązuje (YYYY-MM-DD). */
  validFrom: string;
  /** Odsetki ustawowe za opóźnienie, ułamek roczny (0.115 = 11,5%). */
  statutoryLate: number;
  /** Odsetki w transakcjach handlowych, ułamek roczny. */
  commercial: number;
  /** Skąd wzięta wartość — puste pole oznacza wartość niesprawdzoną. */
  source: string;
}

/**
 * Stawki posortowane rosnąco po dacie. Wartości są PLACEHOLDERAMI
 * o prawdopodobnym rzędzie wielkości — służą do testowania algorytmu,
 * nie do liczenia klientowi.
 */
export const INTEREST_RATES: readonly InterestRate[] = [
  { validFrom: '2023-01-01', statutoryLate: 0.125, commercial: 0.165, source: '' },
  { validFrom: '2025-01-01', statutoryLate: 0.115, commercial: 0.155, source: '' },
  { validFrom: '2026-01-01', statutoryLate: 0.105, commercial: 0.145, source: '' },
];

/** Poniżej tej kwoty odsetki są śmieszne i agent w ogóle o nich nie mówi. */
export const MIN_INTEREST_PLN = 10;

/** Polska konwencja: rok = 365 dni, liczone po dniach rzeczywistych. */
const DAYS_IN_YEAR = 365;

// ═══════════════════════════════════════════════════════════════
// Naliczanie
// ═══════════════════════════════════════════════════════════════

export interface InterestPeriod {
  from: string;
  to: string;
  days: number;
  /** Stawka roczna użyta w tym podokresie. */
  rate: number;
  amount: number;
}

export interface InterestResult {
  total: number;
  periods: InterestPeriod[];
}

function toUtcDay(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

function fromUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function rateAt(day: number, kind: InterestKind): number {
  let value = INTEREST_RATES[0]!;
  for (const entry of INTEREST_RATES) {
    if (toUtcDay(entry.validFrom) <= day) value = entry;
  }
  return kind === 'commercial' ? value.commercial : value.statutoryLate;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Odsetki od kwoty za okres, z podziałem na podokresy według zmian stopy.
 *
 * DLACZEGO PODOKRESY, A NIE JEDNA STAWKA: zaległość ciągnąca się przez
 * zmianę stopy naliczana jedną stawką daje kwotę, której klient nie obroni
 * przed kontrahentem — a wezwanie z kwotą nie do obronienia traci powagę
 * i zabiera powagę wszystkiemu, co wyślemy później.
 *
 * `from` to pierwszy dzień opóźnienia (dzień PO terminie), `to` to dzień
 * naliczenia. Dzień płatności nie jest dniem opóźnienia.
 */
export function calculateInterest(input: {
  principal: number;
  from: string;
  to: string;
  kind: InterestKind;
}): InterestResult {
  const start = toUtcDay(input.from);
  const end = toUtcDay(input.to);

  if (!Number.isFinite(input.principal) || input.principal <= 0 || end <= start) {
    return { total: 0, periods: [] };
  }

  // Granice podokresów: start, każda zmiana stopy w środku, koniec.
  const boundaries = new Set<number>([start, end]);
  for (const entry of INTEREST_RATES) {
    const day = toUtcDay(entry.validFrom);
    if (day > start && day < end) boundaries.add(day);
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const periods: InterestPeriod[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segmentStart = sorted[i]!;
    const segmentEnd = sorted[i + 1]!;
    const days = segmentEnd - segmentStart;
    const rate = rateAt(segmentStart, input.kind);
    const amount = round2((input.principal * rate * days) / DAYS_IN_YEAR);

    periods.push({
      from: fromUtcDay(segmentStart),
      to: fromUtcDay(segmentEnd),
      days,
      rate,
      amount,
    });
  }

  return {
    total: round2(periods.reduce((sum, p) => sum + p.amount, 0)),
    periods,
  };
}

/**
 * Czy w ogóle proponować odsetki.
 *
 * Trzy warunki i każdy potrafi sam zablokować: stawki muszą być sprawdzone,
 * klient musi tego chcieć, a kwota musi mieć sens. Wezwanie z odsetkami
 * na osiemnaście groszy ośmiesza nadawcę.
 */
export function shouldOfferInterest(input: {
  total: number;
  clientOptedIn: boolean;
}): boolean {
  if (!RATES_VERIFIED) return false;
  if (!input.clientOptedIn) return false;
  return input.total >= MIN_INTEREST_PLN;
}

/**
 * Rozliczenie „od–do, stawka, kwota" do dołączenia do wezwania.
 *
 * Kontrahent ma widzieć, skąd wzięła się liczba. Kwota bez rozliczenia jest
 * dla niego żądaniem, a z rozliczeniem — wyliczeniem, z którym da się
 * dyskutować albo je przyjąć.
 */
export function formatInterestBreakdown(result: InterestResult): string[] {
  return result.periods.map(
    (p) =>
      `${p.from} – ${p.to} (${p.days} dni), stawka ${(p.rate * 100).toFixed(1)}% w skali roku: ${p.amount.toFixed(2)} zł`,
  );
}
