import Link from 'next/link';

import { CaptureButton } from '@/components/expenses/capture-button';
import { ExpensesList } from '@/components/expenses/expenses-list';
import { getPageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const unreviewedOnly = filter === 'unreviewed';

  const { supabase, tenantId } = await getPageContext();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  let expensesQuery = supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false });

  if (unreviewedOnly) {
    expensesQuery = expensesQuery.eq('is_reviewed', false).limit(200);
  } else {
    expensesQuery = expensesQuery.gte('issue_date', monthStart).limit(100);
  }

  const { data: expenses, error } = await expensesQuery;

  return (
    <div className="space-y-8 pb-24 text-[var(--ff-on-surface)] lg:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
            Wydatki
          </h1>
          <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
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
              Bieżący miesiąc
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

      <div className="fixed bottom-6 right-6 z-30 lg:hidden">
        <CaptureButton />
      </div>
    </div>
  );
}
