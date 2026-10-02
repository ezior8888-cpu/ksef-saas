import { AdvanceInvoiceForm } from '@/components/invoices/advance-form';
import { SellerProfileBlock } from '@/components/invoices/seller-profile-block';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';

export default async function NewAdvanceInvoicePage() {
  const seller = await loadTenantSellerForForms();
  if (!seller) return <SellerProfileBlock />;

  return (
    <div className="max-w-4xl">
      <AdvanceInvoiceForm initialSeller={seller} />
    </div>
  );
}
