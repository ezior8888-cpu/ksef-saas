/**
 * Podgląd „Następne wystawienie” w arkuszu faktury cyklicznej (plan Finora
 * N1, P6) — te same funkcje harmonogramu co akcje serwera, więc podgląd
 * zgadza się z tym, co zapisze `createRecurringInvoiceAction`
 * (`firstRunDate`) i `updateRecurringInvoiceAction` (`rescheduleRunDate`).
 * „Dziś” podaje wywołujący z serwera (Europe/Warsaw), nigdy z zegara
 * przeglądarki.
 */
import type { RecurringFrequency, RecurringInvoiceRow } from '@/types/recurring-invoice';

import {
  firstRunDate,
  recurringPeriodKey,
  recurringPeriodLabel,
  rescheduleRunDate,
  RECURRING_DAY_MAX,
  RECURRING_DAY_MIN,
} from './schedule';

export interface NextRunPreview {
  /** RRRR-MM-DD. */
  date: string;
  /** „listopad 2026”, „IV kwartał 2026”, „rok 2026”. */
  periodLabel: string;
}

/**
 * Nowa pozycja: najbliższy dzień `dayOfMonth` od dziś. Edycja: bez zmiany
 * dnia i częstotliwości data zostaje, ze zmianą — ten sam miesiąc, nowy dzień.
 * `null`, gdy dzień nie jest liczbą całkowitą 1–28 (formularz pokaże błąd).
 */
export function previewNextRun(input: {
  today: string;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  editing?: Pick<RecurringInvoiceRow, 'next_run_date' | 'frequency' | 'day_of_month'> | null;
}): NextRunPreview | null {
  const { today, frequency, dayOfMonth, editing } = input;
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < RECURRING_DAY_MIN || dayOfMonth > RECURRING_DAY_MAX) return null;
  let date: string;
  if (!editing) {
    date = firstRunDate(today, dayOfMonth);
  } else {
    const changed = editing.frequency !== frequency || editing.day_of_month !== dayOfMonth;
    date = changed ? rescheduleRunDate(editing.next_run_date, dayOfMonth) : editing.next_run_date;
  }
  return { date, periodLabel: recurringPeriodLabel(recurringPeriodKey(date, frequency)) };
}

/** Dzień miesiąca z daty RRRR-MM-DD ograniczony do 1–28 (dzień pozycji cyklicznej). */
export function dayOfMonthFromDate(iso: string): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= RECURRING_DAY_MIN ? Math.min(day, RECURRING_DAY_MAX) : null;
}
