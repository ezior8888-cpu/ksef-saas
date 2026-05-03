import { redirect } from 'next/navigation';

import { AdvanceInvoiceForm } from '@/components/invoices/advance-form';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';

export default async function NewAdvanceInvoicePage() {
  const seller = await loadTenantSellerForForms();
  if (!seller) redirect('/onboarding');

  return (
    <div className="max-w-4xl">
      <AdvanceInvoiceForm initialSeller={seller} />
    </div>
  );
}
