import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { CorrectionInvoiceForm } from '@/components/invoices/correction-form';
import { sanitizeSearch } from '@/lib/invoices/list-query';
import { loadCorrectionPicker, type CorrectionPicker } from '@/lib/invoices/correction-picker';

export default async function NewCorrectionPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tenantId = await getActiveOrgIdFromCookies();
  const environment = requireConfiguredKsefEnvironment();
  const supabase = await createClient();
  const q = sanitizeSearch(params.q ?? '');

  // F-005: `parentId` spoza 50 najnowszych czyta loader osobno, a gdy faktura
  // nie przyjmie korekty — formularz pokazuje dlaczego, zamiast pustego wyboru.
  const picker: CorrectionPicker = tenantId
    ? await loadCorrectionPicker(supabase, { tenantId, environment, parentId: params.parentId, q })
    : { parentInvoices: [], truncated: false, preselectRefusal: null };

  return (
    <div className="max-w-4xl">
      <CorrectionInvoiceForm
        parentInvoices={picker.parentInvoices}
        preselectedParentId={params.parentId}
        preselectRefusal={picker.preselectRefusal}
        searchQuery={q}
        truncated={picker.truncated}
      />
    </div>
  );
}
