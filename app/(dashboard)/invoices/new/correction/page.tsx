import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { CorrectionInvoiceForm } from '@/components/invoices/correction-form';

export default async function NewCorrectionPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string }>;
}) {
  const params = await searchParams;
  const tenantId = await getActiveOrgIdFromCookies();
  const environment = requireConfiguredKsefEnvironment();
  const supabase = await createClient();

  const { data: parentInvoices } = tenantId ? await supabase
    .from('invoices')
    .select('id, internal_number, ksef_number, issue_date, gross_total, buyer_data')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('invoice_kind', 'regular')
    .eq('ksef_environment', environment)
    .not('ksef_number', 'is', null)
    .order('issue_date', { ascending: false })
    .limit(50) : { data: [] };

  return (
    <div className="max-w-4xl">
      <CorrectionInvoiceForm
        parentInvoices={parentInvoices ?? []}
        preselectedParentId={params.parentId}
      />
    </div>
  );
}
