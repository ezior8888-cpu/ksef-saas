import { prefillFromLastInvoiceAction } from '@/components/invoices/actions';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * Podkład z ostatniej faktury pobieramy TUTAJ, na serwerze, i podajemy
 * formularzowi propem. Wariant z `useEffect` w komponencie klienckim dawałby
 * to samo o jedno okrążenie sieci później — a baner podpowiedzi pojawiałby się
 * z opóźnieniem i przesuwał formularz pod palcem, który już celuje w pole.
 *
 * Tak samo zwolnienie z VAT: firma zwolniona dostaje „zw” jako domyślną
 * stawkę nowej pozycji od pierwszego renderu.
 */
export default async function NewRegularInvoicePage() {
  const { supabase, tenantId } = await getPageContext();
  const [podpowiedz, vatExemptionBasis] = await Promise.all([
    prefillFromLastInvoiceAction(),
    readTenantVatExemption(supabase, tenantId),
  ]);

  return (
    <div className="max-w-4xl">
      <InvoiceForm prefill={podpowiedz} vatExempt={vatExemptionBasis !== null} />
    </div>
  );
}
