import { prefillFromLastInvoiceAction } from '@/components/invoices/actions';
import { InvoiceForm } from '@/components/invoices/invoice-form';

/**
 * Podkład z ostatniej faktury pobieramy TUTAJ, na serwerze, i podajemy
 * formularzowi propem. Wariant z `useEffect` w komponencie klienckim dawałby
 * to samo o jedno okrążenie sieci później — a baner podpowiedzi pojawiałby się
 * z opóźnieniem i przesuwał formularz pod palcem, który już celuje w pole.
 */
export default async function NewRegularInvoicePage() {
  const podpowiedz = await prefillFromLastInvoiceAction();

  return (
    <div className="max-w-4xl">
      <InvoiceForm prefill={podpowiedz} />
    </div>
  );
}
