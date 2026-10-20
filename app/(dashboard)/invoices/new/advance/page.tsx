import { AdvanceInvoiceForm } from '@/components/invoices/advance-form';
import { SellerProfileBlock } from '@/components/invoices/seller-profile-block';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';

export default async function NewAdvanceInvoicePage() {
  const seller = await loadTenantSellerForForms();
  if (!seller) return <SellerProfileBlock />;

  // P5: szerokość daje siatka Finory w formularzu (dokument + kolumna 18rem).
  return <AdvanceInvoiceForm initialSeller={seller} />;
}
