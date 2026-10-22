import { getCosts } from '@/lib/dashboard/costs';
import {
  findRecurringCosts,
  recurringCostsMonthlyTotal,
  recurringMonthKeys,
  type RecurringCost,
} from '@/lib/dashboard/recurring-costs';
import { shiftMonth } from '@/lib/expenses/month';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import type { PageContext } from '@/lib/supabase/page-context';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Liczby kafli `/expenses` (P8) i `/inbox` (P9) — plan Finora §5.
 *
 * Kwoty biorą WYŁĄCZNIE `getCosts` (§2.4 pkt 12: `is_deductible`, komplet
 * stron, środowisko KSeF, waluta kosztów ze skrzynki), nigdy listy na
 * stronie: lista `/expenses` ma `limit(500)` i nie filtruje środowiska, a
 * skrzynka pokazuje faktury ze wszystkich środowisk (rejestr dokumentów).
 * Liczniki „do opisania” to zwykłe zliczenia z tym samym warunkiem co filtr
 * „Do opisania” na liście, żeby liczba zgadzała się z tym, co klient zobaczy
 * po kliknięciu.
 */

type Supabase = PageContext['supabase'];

export interface ExpenseMonthTotals {
  /** Miesiąc RRRR-MM. */
  month: string;
  /** Wypływ brutto (`gross_amount`) kosztów miesiąca. */
  gross: number;
  /** VAT do odliczenia (reguła JPK_V7M z `getCosts`). */
  vatDeductible: number;
}

export interface RecurringExpenseStats {
  /** Stałe koszty z okna 4 miesięcy kończącego się na wybranym miesiącu (N3). */
  recurring: RecurringCost[];
  recurringTotal: number;
}

/**
 * Kafle P8 „Wydatki w miesiącu” i „VAT do odliczenia” dla miesiąca `month`
 * (RRRR-MM). Osobne zapytanie tylko o ten miesiąc (P8, §2.4 pkt 12): koszt
 * spoza miesiąca, którego `getCosts` nie przepuszcza (np. KSeF w walucie
 * bez kursu), nie zabiera tych kafli (§2.4 pkt 15).
 */
export async function getExpenseMonthTotals(
  supabase: Supabase,
  tenantId: string,
  month: string,
): Promise<ExpenseMonthTotals> {
  const entries = await getCosts(supabase, tenantId, {
    from: `${month}-01`,
    toExclusive: `${shiftMonth(month, 1)}-01`,
  });
  return {
    month,
    gross: roundToCents(entries.reduce((sum, entry) => sum + entry.outflow, 0)),
    vatDeductible: roundToCents(entries.reduce((sum, entry) => sum + entry.vatDeductible, 0)),
  };
}

/** Kafel P8 „Stałe koszty” (N3): własne zapytanie z okna 4 miesięcy kończącego się na `month`. */
export async function getRecurringExpenseStats(
  supabase: Supabase,
  tenantId: string,
  month: string,
): Promise<RecurringExpenseStats> {
  const keys = recurringMonthKeys(month);
  const entries = await getCosts(supabase, tenantId, {
    from: `${keys[0]}-01`,
    toExclusive: `${shiftMonth(month, 1)}-01`,
  });
  const recurring = findRecurringCosts(entries, keys);
  return { recurring, recurringTotal: recurringCostsMonthlyTotal(recurring) };
}

/** Kafel P9 „Faktury kosztowe w miesiącu”: koszty ze skrzynki KSeF w bieżącym miesiącu (Europe/Warsaw). */
export async function getInboxMonthCosts(
  supabase: Supabase,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ month: string; gross: number; count: number }> {
  const month = todayInWarsaw(now).slice(0, 7);
  const entries = await getCosts(supabase, tenantId, {
    from: `${month}-01`,
    toExclusive: `${shiftMonth(month, 1)}-01`,
  });
  const fromInbox = entries.filter((entry) => entry.source === 'ksef_inbox');
  return {
    month,
    gross: roundToCents(fromInbox.reduce((sum, entry) => sum + entry.outflow, 0)),
    count: fromInbox.length,
  };
}

/**
 * Liczba wydatków `is_reviewed = false` (ten sam warunek co
 * `/expenses?filter=unreviewed`). `source: 'ksef_inbox'` — tylko faktury ze
 * skrzynki (kafel P9 „Nowe faktury”).
 */
export async function countExpensesToReview(
  supabase: Supabase,
  tenantId: string,
  options: { source?: 'ksef_inbox' } = {},
): Promise<number> {
  let query = supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_reviewed', false);
  if (options.source) query = query.eq('source', options.source);
  const { count, error } = await query;
  if (error) throw new Error(`Nie można policzyć wydatków do opisania: ${error.message}`);
  return count ?? 0;
}

/**
 * Kafel P9 „Ostatnie pobranie z KSeF”: chwila zapisu najnowszej faktury
 * kosztowej (`created_at`), czyli ostatniego pobrania, które coś przyniosło.
 * Kursora skrzynki (`ksef_inbox_cursor`) klient nie czyta — to dane operatora
 * bez polityki SELECT (00063).
 */
export async function getLastInboxFetchAt(supabase: Supabase, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Nie można odczytać ostatniego pobrania z KSeF: ${error.message}`);
  return (data?.created_at as string | null | undefined) ?? null;
}
