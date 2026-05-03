import { createClient } from '@/lib/supabase/server';
import { CorrectionInvoiceForm } from '@/components/invoices/correction-form';

export default async function NewCorrectionPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: parentInvoices } = await supabase
    .from('invoices')
    .select('id, internal_number, ksef_number, issue_date, gross_total, buyer_data')
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('invoice_kind', 'regular')
    .order('issue_date', { ascending: false })
    .limit(50);

  return (
    <div className="max-w-4xl">
      <CorrectionInvoiceForm
        parentInvoices={parentInvoices ?? []}
        preselectedParentId={params.parentId}
      />
    </div>
  );
}
