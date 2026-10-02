import Link from 'next/link';

import { CaptureButton } from '@/components/expenses/capture-button';
import { ExpensesList } from '@/components/expenses/expenses-list';
import { monthLabel, monthRange, parseExpenseMonth, shiftMonth } from '@/lib/expenses/month';
import { getPageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
    <div className="space-y-8 pb-24 text-[var(--ff-on-surface)] lg:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
            Wydatki
          </h1>
          <p className="text-sm text-[var(--ff-text-muted)]">
            Faktury kosztowe i paragony — automatycznie kategoryzowane do KPiR
          </p>
          <div className="ff-glass-pane inline-flex rounded-full p-1">
            <Link
              href="/expenses"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-bold transition-colors',
                !unreviewedOnly
                  ? 'bg-[color-mix(in_srgb,var(--ff-on-surface)_12%,transparent)] text-[var(--ff-on-surface)]'
                  : 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] hover:text-[var(--ff-on-surface)]',
              )}
            >
              Miesiąc
            </Link>
            <Link
              href="/expenses?filter=unreviewed"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-bold transition-colors',
                unreviewedOnly
                  ? 'bg-[color-mix(in_srgb,var(--ff-on-surface)_12%,transparent)] text-[var(--ff-on-surface)]'
                  : 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] hover:text-[var(--ff-on-surface)]',
              )}
            >
              Do akceptacji
            </Link>
          </div>
        </div>
        <div className="hidden lg:block">
          <CaptureButton />
        </div>
      </div>

      {!unreviewedOnly && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Miesiąc wydatków">
          <Link className="font-semibold text-[var(--ff-primary)]" href={`/expenses?miesiac=${shiftMonth(month, -1)}`}>
            ← {monthLabel(shiftMonth(month, -1))}
          </Link>
          <span className="font-bold capitalize">{monthLabel(month)}</span>
          {month < currentMonth ? (
            <Link className="font-semibold text-[var(--ff-primary)]" href={`/expenses?miesiac=${shiftMonth(month, 1)}`}>
              {monthLabel(shiftMonth(month, 1))} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {error ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] border border-red-400/25 bg-[color-mix(in_srgb,#f87171_10%,transparent)] p-4 text-sm text-red-200">
          Nie udało się pobrać wydatków: {error.message}
        </div>
      ) : (
        <ExpensesList
          initialExpenses={expenses ?? []}
          listVariant={unreviewedOnly ? 'unreviewed' : 'month'}
        />
      )}

      <div className="fixed bottom-[calc(1.5rem+var(--ff-bottom-nav-h)+var(--ff-safe-b))] right-6 z-30 lg:hidden">
        <CaptureButton />
      </div>
    </div>
  );
}
