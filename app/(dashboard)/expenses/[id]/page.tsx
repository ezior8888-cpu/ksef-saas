import { notFound } from 'next/navigation';

import { ExpenseEditForm } from '@/components/expenses/expense-edit-form';
import { createClient } from '@/lib/supabase/server';
import { getExpensePhotoUrl } from '@/lib/storage/expenses';

export const dynamic = 'force-dynamic';

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: expense, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !expense) notFound();

  let photoUrl: string | null = null;
  if (expense.source === 'ocr_photo' && expense.source_file_path) {
    photoUrl = await getExpensePhotoUrl(expense.source_file_path);
  }

  return <ExpenseEditForm expense={expense} photoUrl={photoUrl} />;
}
