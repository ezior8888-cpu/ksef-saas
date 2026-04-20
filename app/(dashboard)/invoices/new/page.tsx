import { InvoiceForm } from '@/components/invoices/invoice-form';

export default function NewInvoicePage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Nowa faktura</h1>
      <InvoiceForm />
    </div>
  );
}
