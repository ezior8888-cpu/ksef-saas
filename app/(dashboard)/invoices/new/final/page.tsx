import { FinalInvoiceForm } from '@/components/invoices/final-form';
import { SellerProfileBlock } from '@/components/invoices/seller-profile-block';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';
import { findAdvancesAlreadySettled } from '@/lib/invoices/settled-advances';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';

export default async function NewFinalInvoicePage() {
  const seller = await loadTenantSellerForForms();
  if (!seller) return <SellerProfileBlock />;

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) return <SellerProfileBlock />;

  // C-09: tylko zaliczki przyjęte w AKTYWNYM środowisku KSeF — inaczej
  // formularz pozwoliłby rozliczyć zaliczkę z innego środowiska, a akcja
  // zapisu i tak by ją odrzuciła (fetchSettlementRows), tracąc czas klienta.
  const environment = requireConfiguredKsefEnvironment();
  const supabase = await createClient();
  const { data: advances } = await supabase
    .from('invoices')
    .select('id, internal_number, ksef_number, issue_date, advance_amount, gross_total')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('invoice_kind', 'advance')
    .eq('ksef_environment', environment)
    .order('issue_date', { ascending: false })
    .limit(120);

  // AUD-67: zaliczki już wskazane w innej ROZ nie trafiają na listę. Gdy
  // odczyt się nie uda, lista zostaje pełna — zapis i tak sprawdza akcja
  // oraz wyzwalacz bazy (00125).
  let available = advances ?? [];
  try {
    const settled = await findAdvancesAlreadySettled(
      supabase,
      tenantId,
      available.map((a) => a.id as string),
    );
    available = available.filter((a) => !settled.has(a.id as string));
  } catch {
    // celowo: patrz komentarz wyżej
  }

  return (
    <div className="max-w-4xl">
      <FinalInvoiceForm initialSeller={seller} advanceInvoices={available} />
    </div>
  );
}
