import { CaptureButton } from '@/components/expenses/capture-button';
import { ExpensesList } from '@/components/expenses/expenses-list';
import { getPageContext } from '@/lib/supabase/page-context';

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
    <div className="space-y-8 pb-24 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
            Wydatki
          </h1>
          <p className="mt-2 text-muted-foreground">
            Faktury kosztowe i paragony — automatycznie kategoryzowane do KPiR
          </p>
        </div>
        <div className="hidden lg:block">
          <CaptureButton />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
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
