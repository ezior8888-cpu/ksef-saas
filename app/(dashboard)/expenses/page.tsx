import Link from 'next/link';

import { CaptureButton } from '@/components/expenses/capture-button';
import { ExpenseStatsCards } from '@/components/expenses/finora/expense-stat-cells';
import { ExpensesTable } from '@/components/expenses/finora/expenses-table';
import MonthSelector from '@/components/expenses/finora/month-selector';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { monthRange, parseExpenseMonth } from '@/lib/expenses/month';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

/**
 * Wydatki (plan Finora P8 ← Finora `/transactions`: `TransactionsView` =
 * kafle + karta z tabelą, `space-y-6`). Nagłówek z wyborem miesiąca jak
 * w Finora Monthly Analytics. Lista i jej zapytanie bez zmian (F-087: miesiąc
 * od–do albo wszystkie „Do opisania”); kafle liczą własne zapytania (§2.4
 * pkt 12) w osobnych granicach błędu.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; miesiac?: string }>;
}) {
  const { filter, miesiac } = await searchParams;
  const unreviewedOnly = filter === 'unreviewed';

  const { supabase, tenantId } = await getPageContext();

  // Wybrany miesiąc (domyślnie bieżący w czasie polskim) z zakresem od–do
  // — wcześniej tylko „od początku bieżącego miesiąca” w strefie serwera (F-087).
  const month = parseExpenseMonth(miesiac);
  const currentMonth = parseExpenseMonth(undefined);
  const { from: monthStart, to: monthEnd } = monthRange(month);

  let expensesQuery = supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false });

  if (unreviewedOnly) {
    expensesQuery = expensesQuery.eq('is_reviewed', false).limit(200);
  } else {
    expensesQuery = expensesQuery.gte('issue_date', monthStart).lte('issue_date', monthEnd).limit(500);
  }

  const { data: expenses, error } = await expensesQuery;

  return (
    <div className="space-y-6 pb-24 lg:pb-10">
      <div className="flex justify-between gap-3 max-sm:flex-col sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Wydatki</h1>
          <p className="text-muted-foreground text-sm">
            Faktury kosztowe i paragony — automatycznie kategoryzowane do KPiR
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:self-end">
          <nav aria-label="Widok listy wydatków" className="flex">
            <Link
              href="/expenses"
              aria-current={!unreviewedOnly ? 'page' : undefined}
              className={buttonVariants({ variant: !unreviewedOnly ? 'default' : 'outline' })}
            >
              Miesiąc
            </Link>
            <Link
              href="/expenses?filter=unreviewed"
              aria-current={unreviewedOnly ? 'page' : undefined}
              className={buttonVariants({ variant: unreviewedOnly ? 'default' : 'outline' })}
            >
              Do opisania
            </Link>
          </nav>
          {!unreviewedOnly ? (
            <MonthSelector month={month} currentMonth={currentMonth} basePath="/expenses" />
          ) : null}
        </div>
      </div>

      <ExpenseStatsCards supabase={supabase} tenantId={tenantId} month={month} />

      {error ? (
        <>
          <Alert variant="destructive">
            <AlertTitle>Nie udało się pobrać wydatków: {error.message}</AlertTitle>
          </Alert>
          {/* Od `lg` przycisk stoi w pasku tabeli; bez tabeli dodawanie zostaje tu. */}
          <div className="flex justify-end max-lg:hidden">
            <CaptureButton />
          </div>
        </>
      ) : (
        <Card>
          <ExpensesTable
            expenses={expenses ?? []}
            listVariant={unreviewedOnly ? 'unreviewed' : 'month'}
          />
        </Card>
      )}

      <div className="fixed bottom-[calc(1.5rem+var(--ff-bottom-nav-h)+var(--ff-safe-b))] right-6 z-30 lg:hidden">
        <CaptureButton triggerClassName="h-11 px-4 shadow-lg" />
      </div>
    </div>
  );
}
