/**
 * Harmonogram faktur cyklicznych (plan Finora N1) — czyste funkcje na datach
 * kalendarzowych RRRR-MM-DD, bez strefy czasowej. „Dziś” podaje wywołujący,
 * zawsze z `todayInWarsaw()` (Europe/Warsaw), żeby po północy w Polsce, a przed
 * północą UTC, pozycja nie była jeszcze „wczoraj”.
 *
 * Okres faktury (`recurringPeriodKey`) liczy się z `next_run_date` pozycji
 * w chwili zapisu faktury: pozycja z `next_run_date = 2026-11-10` co miesiąc
 * wystawia fakturę za okres `2026-11`. Ten klucz trafia do
 * `invoices.recurring_period`, a unikalny indeks z 00154 pilnuje, żeby za
 * jeden okres powstała najwyżej jedna faktura.
 *
 * Format klucza (CHECK `invoices_recurring_period_format_check` w 00154):
 *  - co miesiąc: `RRRR-MM` (np. `2026-11`),
 *  - co kwartał: `RRRR-Qn` (np. `2026-Q4`),
 *  - co rok: `RRRR` (np. `2026`).
 */
import type { RecurringFrequency, RecurringInvoiceRow, RecurringStatus } from '@/types/recurring-invoice';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dzień miesiąca pozycji: 1–28 (CHECK w 00154), żeby był w każdym miesiącu. */
export const RECURRING_DAY_MIN = 1;
export const RECURRING_DAY_MAX = 28;

const MONTHS_STEP: Record<RecurringFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

interface YearMonthDay {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
}

function parseIsoDate(value: string): YearMonthDay {
  const m = ISO_DATE.exec(value);
  if (!m) throw new Error(`Nieprawidłowa data: ${value}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`Nieprawidłowa data: ${value}`);
  }
  return { year, month, day };
}

function assertDay(dayOfMonth: number): void {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < RECURRING_DAY_MIN || dayOfMonth > RECURRING_DAY_MAX) {
    throw new Error(`Dzień miesiąca musi być liczbą od ${RECURRING_DAY_MIN} do ${RECURRING_DAY_MAX}`);
  }
}

function format({ year, month, day }: YearMonthDay): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Ten sam dzień `dayOfMonth` w miesiącu przesuniętym o `months` (dzień ≤ 28 jest w każdym miesiącu). */
function shiftMonths(year: number, month: number, months: number, dayOfMonth: number): string {
  const index = year * 12 + (month - 1) + months;
  return format({ year: Math.floor(index / 12), month: (index % 12) + 1, day: dayOfMonth });
}

/**
 * Następna data wystawienia po `from`: miesiąc, kwartał albo rok później,
 * w dniu `dayOfMonth`. Przełom roku liczy się sam (`2026-12-10` co miesiąc →
 * `2027-01-10`).
 */
export function nextRunDate(from: string, frequency: RecurringFrequency, dayOfMonth: number): string {
  assertDay(dayOfMonth);
  const { year, month } = parseIsoDate(from);
  return shiftMonths(year, month, MONTHS_STEP[frequency], dayOfMonth);
}

/**
 * Pierwsza data wystawienia nowej pozycji: najbliższy dzień `dayOfMonth`,
 * który nie jest wcześniejszy niż dziś (Europe/Warsaw). Dziś 20.10 i dzień 25
 * → 25.10; dziś 20.10 i dzień 5 → 05.11; dziś 20.10 i dzień 20 → 20.10
 * (od razu „Do wystawienia”).
 */
export function firstRunDate(todayWarsaw: string, dayOfMonth: number): string {
  assertDay(dayOfMonth);
  const today = parseIsoDate(todayWarsaw);
  return shiftMonths(today.year, today.month, today.day <= dayOfMonth ? 0 : 1, dayOfMonth);
}

/** Okres, za który wystawiamy fakturę z pozycji o tej `next_run_date` (format w nagłówku pliku). */
export function recurringPeriodKey(runDate: string, frequency: RecurringFrequency): string {
  const { year, month } = parseIsoDate(runDate);
  const y = String(year).padStart(4, '0');
  switch (frequency) {
    case 'monthly':
      return `${y}-${String(month).padStart(2, '0')}`;
    case 'quarterly':
      return `${y}-Q${Math.floor((month - 1) / 3) + 1}`;
    case 'yearly':
      return y;
  }
}

/** Stan pozycji przy odczycie: wstrzymana, „Do wystawienia” (dzień minął albo jest dziś) albo aktywna. */
export function statusOf(
  row: Pick<RecurringInvoiceRow, 'active' | 'next_run_date'>,
  todayWarsaw: string,
): RecurringStatus {
  if (!row.active) return 'paused';
  return row.next_run_date <= todayWarsaw ? 'due' : 'active';
}

/**
 * Nowa data po zmianie dnia albo częstotliwości: ten sam miesiąc co obecna
 * `next_run_date`, nowy dzień. Okres, który czeka na wystawienie, nie
 * przepada, a okres już wystawiony nie wraca (data zostaje w tym samym
 * miesiącu, który harmonogram ma przed sobą).
 */
export function rescheduleRunDate(currentRunDate: string, dayOfMonth: number): string {
  assertDay(dayOfMonth);
  const { year, month } = parseIsoDate(currentRunDate);
  return shiftMonths(year, month, 0, dayOfMonth);
}

/**
 * Data po wznowieniu wstrzymanej pozycji: okresy, które w całości minęły
 * w czasie wstrzymania, pomijamy (wstrzymanie = „nie fakturuj w tym czasie”),
 * ale ostatni okres, którego dzień już nadszedł, zostaje „Do wystawienia”.
 * Wstrzymana 10.03 i wznowiona 20.10 (co miesiąc, dzień 10) → 10.10.
 * Data z przyszłości zostaje bez zmian.
 */
export function catchUpRunDate(
  currentRunDate: string,
  frequency: RecurringFrequency,
  dayOfMonth: number,
  todayWarsaw: string,
): string {
  parseIsoDate(todayWarsaw);
  let run = rescheduleRunDate(currentRunDate, dayOfMonth);
  // Najwyżej kilkaset kroków (co miesiąc przez dziesięciolecia) — pętla bez ryzyka.
  for (let next = nextRunDate(run, frequency, dayOfMonth); next <= todayWarsaw; next = nextRunDate(run, frequency, dayOfMonth)) {
    run = next;
  }
  return run;
}

const MONTH_NAMES = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
] as const;
const QUARTER_NAMES = ['I', 'II', 'III', 'IV'] as const;

/**
 * Okres po polsku do interfejsu: `2026-11` → „listopad 2026”, `2026-Q4` →
 * „IV kwartał 2026”, `2026` → „rok 2026”. Nieznany format wraca bez zmian.
 */
export function recurringPeriodLabel(period: string): string {
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (month) return `${MONTH_NAMES[Number(month[2]) - 1]} ${month[1]}`;
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) return `${QUARTER_NAMES[Number(quarter[2]) - 1]} kwartał ${quarter[1]}`;
  if (/^\d{4}$/.test(period)) return `rok ${period}`;
  return period;
}
