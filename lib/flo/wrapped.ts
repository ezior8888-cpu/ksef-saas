/**
 * S-03 — dane do FaktFlow Wrapped (krok 50 planu).
 *
 * Siedem ekranów przewijanych palcem, każdy z jedną liczbą. Dane z
 * `mv_tenant_monthly_stats`, ZERO WYWOŁAŃ MODELU — ten plik świadomie nie
 * importuje niczego z `lib/flo/llm`, a osobny test skanuje jego źródło.
 * Powód jest prosty: podsumowanie roku ogląda naraz całe konto klientów
 * w jednym tygodniu grudnia, a rachunek za model liczyłby się wtedy
 * w tysiącach.
 *
 * ZASADA, KTÓREJ NIE WOLNO ZŁAMAĆ: PRZY SPADKU NIE MA DYNAMIKI.
 *
 * Wrapped u kogoś, komu rok wyszedł gorzej, nie może być raportem o tym,
 * że wyszedł gorzej. Człowiek, który stracił dwóch największych klientów,
 * nie potrzebuje animacji z liczbą „−38%”. Dlatego przy spadku sekwencja
 * DOBIERA INNE EKRANY — takie, które są prawdziwe niezależnie od przychodu:
 * ilu obsłużył klientów, jak długa jest najdłuższa współpraca, jak wypada
 * jego terminowość. Żadna liczba ujemna nie ma prawa wyjść z tej funkcji
 * i jest na to osobny test.
 *
 * NAZWY KONTRAHENTÓW SĄ DOMYŚLNIE ZASŁONIĘTE. „Twój największy klient”
 * zamiast nazwy — bo ekran zapisuje się w formacie 9:16 i ląduje na
 * Instagramie, a klient nie pytał nikogo o zgodę na pokazanie, ile u niego
 * wydał.
 */

import { formatPln } from '@/lib/flo/money';

// ═══════════════════════════════════════════════════════════════
// Wejście
// ═══════════════════════════════════════════════════════════════

/** Wiersz z `mv_tenant_monthly_stats` zawężony do tego, czego używamy. */
export interface MonthFigure {
  /** „2026-07” */
  yearMonth: string;
  invoiceCount: number;
  acceptedCount: number;
  rejectedCount: number;
  totalGross: number;
}

export interface ContractorFigure {
  id: string;
  name: string;
  /** Suma brutto w roku. */
  gross: number;
  /** Średnia liczba dni od terminu do wpłaty; ujemna = płaci przed terminem. */
  avgDaysToPay: number;
  /** Miesiąc pierwszej faktury, „2023-04”. */
  firstInvoiceMonth: string;
}

export interface WrappedInput {
  year: number;
  months: readonly MonthFigure[];
  contractors: readonly ContractorFigure[];
  /** Przychód brutto poprzedniego roku; `null` = pierwszy rok. */
  previousYearGross: number | null;
  /**
   * Prawdziwe nazwy kontrahentów. WYŁĄCZNIE na wyraźne żądanie człowieka —
   * domyślnie `false`.
   */
  revealNames?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Wyjście
// ═══════════════════════════════════════════════════════════════

export type WrappedScreenKey =
  // Zestaw podstawowy
  | 'total_invoiced'
  | 'best_month'
  | 'biggest_client'
  | 'fastest_payer'
  | 'invoice_count'
  | 'ksef_clean'
  | 'quarter_to_quarter'
  // Zestaw dla słabszego roku
  | 'clients_served'
  | 'longest_relationship'
  | 'punctuality';

export interface WrappedScreen {
  key: WrappedScreenKey;
  /** Nagłówek ekranu. */
  label: string;
  /** Jedna liczba, gotowy napis. */
  value: string;
  /** Podpis pod liczbą. */
  caption: string;
}

export interface WrappedResult {
  year: number;
  /** `growth` = rok co najmniej tak dobry jak poprzedni. */
  variant: 'growth' | 'steady';
  screens: WrappedScreen[];
  /** Czy prawdziwe nazwy są odsłonięte. */
  namesRevealed: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Budowa
// ═══════════════════════════════════════════════════════════════

/** Etykieta zastępcza — domyślna. Prawdziwa nazwa tylko na żądanie. */
const PLACEHOLDER_BIGGEST = 'Twój największy klient';
const PLACEHOLDER_FASTEST = 'Twój najszybciej płacący klient';
const PLACEHOLDER_LONGEST = 'Twoja najdłuższa współpraca';

export function buildWrapped(input: WrappedInput): WrappedResult {
  const totalGross = sum(input.months.map((month) => month.totalGross));
  const totalInvoices = sum(input.months.map((month) => month.invoiceCount));

  const grew =
    input.previousYearGross === null || totalGross >= input.previousYearGross;

  const revealNames = input.revealNames === true;

  const screens = grew
    ? growthScreens(input, totalGross, totalInvoices, revealNames)
    : steadyScreens(input, totalGross, totalInvoices, revealNames);

  return {
    year: input.year,
    variant: grew ? 'growth' : 'steady',
    screens,
    namesRevealed: revealNames,
  };
}

function growthScreens(
  input: WrappedInput,
  totalGross: number,
  totalInvoices: number,
  revealNames: boolean,
): WrappedScreen[] {
  const best = bestMonth(input.months);
  const biggest = biggestClient(input.contractors);
  const fastest = fastestPayer(input.contractors);
  const clean = ksefCleanShare(input.months);
  const quarters = quarterToQuarter(input.months);

  const screens: WrappedScreen[] = [
    {
      key: 'total_invoiced',
      label: `Tyle zafakturowałeś w ${input.year}`,
      value: formatPln(totalGross),
      caption: 'Brutto, ze wszystkich wystawionych faktur.',
    },
    {
      key: 'invoice_count',
      label: 'Tyle faktur wystawiłeś',
      value: String(totalInvoices),
      caption: 'Każda z nich to była czyjaś decyzja, żeby z Tobą pracować.',
    },
  ];

  if (best) {
    screens.push({
      key: 'best_month',
      label: 'Twój najlepszy miesiąc',
      value: monthName(best.yearMonth),
      caption: `${formatPln(best.totalGross)} w jednym miesiącu.`,
    });
  }

  if (biggest) {
    screens.push({
      key: 'biggest_client',
      label: revealNames ? biggest.name : PLACEHOLDER_BIGGEST,
      value: formatPln(biggest.gross),
      caption: 'Tyle u Ciebie zamówił.',
    });
  }

  if (fastest) {
    screens.push({
      key: 'fastest_payer',
      label: revealNames ? fastest.name : PLACEHOLDER_FASTEST,
      value: describePaymentSpeed(fastest.avgDaysToPay),
      caption: 'Tacy klienci są warci więcej, niż wynika z faktury.',
    });
  }

  if (clean !== null) {
    screens.push({
      key: 'ksef_clean',
      label: 'Tyle faktur poszło do KSeF bez poprawki',
      value: `${clean}%`,
      caption: 'Za pierwszym razem, bez odrzucenia.',
    });
  }

  if (quarters) {
    screens.push({
      key: 'quarter_to_quarter',
      label: 'Twój najmocniejszy kwartał',
      value: quarters.label,
      caption: `${formatPln(quarters.gross)} w trzy miesiące.`,
    });
  }

  return screens.slice(0, 7);
}

/**
 * Zestaw dla roku, który wyszedł słabiej.
 *
 * Same wartości bezwzględne i same rzeczy, które są prawdziwe niezależnie
 * od przychodu. Ani jednego porównania z poprzednim rokiem.
 */
function steadyScreens(
  input: WrappedInput,
  totalGross: number,
  totalInvoices: number,
  revealNames: boolean,
): WrappedScreen[] {
  const longest = longestRelationship(input.contractors, input.year);
  const punctual = punctualityShare(input.contractors);
  const clean = ksefCleanShare(input.months);

  const screens: WrappedScreen[] = [
    {
      key: 'clients_served',
      label: 'Tylu klientów obsłużyłeś',
      value: String(input.contractors.length),
      caption: 'Każdy z nich wybrał Ciebie.',
    },
    {
      key: 'total_invoiced',
      label: `Tyle zafakturowałeś w ${input.year}`,
      value: formatPln(totalGross),
      caption: 'Brutto, ze wszystkich wystawionych faktur.',
    },
    {
      key: 'invoice_count',
      label: 'Tyle faktur wystawiłeś',
      value: String(totalInvoices),
      caption: 'Każda z nich to była czyjaś decyzja, żeby z Tobą pracować.',
    },
  ];

  if (longest) {
    screens.push({
      key: 'longest_relationship',
      label: revealNames ? longest.contractor.name : PLACEHOLDER_LONGEST,
      value: `${longest.years} ${yearWord(longest.years)}`,
      caption: 'Tyle trwa Wasza współpraca.',
    });
  }

  if (punctual !== null) {
    screens.push({
      key: 'punctuality',
      label: 'Tylu Twoich klientów płaci w terminie',
      value: `${punctual}%`,
      caption: 'To rzadziej spotykane, niż się wydaje.',
    });
  }

  if (clean !== null) {
    screens.push({
      key: 'ksef_clean',
      label: 'Tyle faktur poszło do KSeF bez poprawki',
      value: `${clean}%`,
      caption: 'Za pierwszym razem, bez odrzucenia.',
    });
  }

  return screens.slice(0, 7);
}

// ═══════════════════════════════════════════════════════════════
// Liczby
// ═══════════════════════════════════════════════════════════════

function bestMonth(months: readonly MonthFigure[]): MonthFigure | null {
  if (months.length === 0) return null;
  return [...months].sort((a, b) => b.totalGross - a.totalGross)[0]!;
}

function biggestClient(
  contractors: readonly ContractorFigure[],
): ContractorFigure | null {
  if (contractors.length === 0) return null;
  return [...contractors].sort((a, b) => b.gross - a.gross)[0]!;
}

function fastestPayer(
  contractors: readonly ContractorFigure[],
): ContractorFigure | null {
  if (contractors.length === 0) return null;
  return [...contractors].sort((a, b) => a.avgDaysToPay - b.avgDaysToPay)[0]!;
}

/**
 * „Płaci od razu” / „Płaci w 3 dni”.
 *
 * Ujemna średnia (płatność przed terminem) NIE JEST pokazywana jako liczba
 * ujemna — wartość ujemna na ekranie Wrapped wygląda jak zła wiadomość,
 * nawet gdy jest najlepszą w całym zestawieniu.
 */
function describePaymentSpeed(avgDaysToPay: number): string {
  const days = Math.round(avgDaysToPay);
  if (days <= 0) return 'Płaci przed terminem';
  if (days === 1) return 'Płaci w 1 dzień';
  return `Płaci w ${days} dni`;
}

function ksefCleanShare(months: readonly MonthFigure[]): number | null {
  const accepted = sum(months.map((month) => month.acceptedCount));
  const rejected = sum(months.map((month) => month.rejectedCount));
  const total = accepted + rejected;
  if (total === 0) return null;
  return Math.round((accepted / total) * 100);
}

function quarterToQuarter(
  months: readonly MonthFigure[],
): { label: string; gross: number } | null {
  if (months.length === 0) return null;

  const byQuarter = new Map<number, number>();
  for (const month of months) {
    const monthNumber = Number(month.yearMonth.slice(5, 7));
    const quarter = Math.ceil(monthNumber / 3);
    byQuarter.set(quarter, (byQuarter.get(quarter) ?? 0) + month.totalGross);
  }

  const best = [...byQuarter.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;

  return { label: `Kwartał ${best[0]}`, gross: best[1] };
}

function longestRelationship(
  contractors: readonly ContractorFigure[],
  year: number,
): { contractor: ContractorFigure; years: number } | null {
  if (contractors.length === 0) return null;

  const sorted = [...contractors].sort((a, b) =>
    a.firstInvoiceMonth.localeCompare(b.firstInvoiceMonth),
  );
  const oldest = sorted[0]!;
  const years = Math.max(1, year - Number(oldest.firstInvoiceMonth.slice(0, 4)));

  return { contractor: oldest, years };
}

function punctualityShare(
  contractors: readonly ContractorFigure[],
): number | null {
  if (contractors.length === 0) return null;
  const onTime = contractors.filter((c) => c.avgDaysToPay <= 0).length;
  return Math.round((onTime / contractors.length) * 100);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const MONTH_NAMES = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

function monthName(yearMonth: string): string {
  return MONTH_NAMES[Number(yearMonth.slice(5, 7)) - 1] ?? yearMonth;
}

function yearWord(years: number): string {
  if (years === 1) return 'rok';
  const lastDigit = years % 10;
  const lastTwo = years % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return 'lata';
  }
  return 'lat';
}
