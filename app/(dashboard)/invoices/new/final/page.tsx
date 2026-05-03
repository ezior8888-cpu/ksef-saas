import { redirect } from 'next/navigation';

import { FinalInvoiceForm } from '@/components/invoices/final-form';
import { createClient } from '@/lib/supabase/server';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';

export default async function NewFinalInvoicePage() {
  const seller = await loadTenantSellerForForms();
  if (!seller) redirect('/onboarding');

  const supabase = await createClient();
  const { data: advances } = await supabase
    .from('invoices')
    .select('id, internal_number, ksef_number, issue_date, advance_amount, gross_total')
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('invoice_kind', 'advance')
    .order('issue_date', { ascending: false })
    .limit(120);

  return (
    <div className="max-w-4xl">
      <FinalInvoiceForm initialSeller={seller} advanceInvoices={advances ?? []} />
    </div>
  );
}
