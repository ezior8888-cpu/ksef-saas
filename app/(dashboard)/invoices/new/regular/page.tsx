import { prefillFromLastInvoiceAction } from '@/components/invoices/actions';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { suggestNextInvoiceNumberForTenant } from '@/lib/invoices/next-number';
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
 *
 * I numer: podpowiedź kolejnego po ostatniej fakturze (F-015), żeby seria
 * nie zależała od pamięci użytkownika.
 */
export default async function NewRegularInvoicePage() {
  const { supabase, tenantId } = await getPageContext();
  const [podpowiedz, vatExemptionBasis, suggestedNumber] = await Promise.all([
    prefillFromLastInvoiceAction(),
    readTenantVatExemption(supabase, tenantId),
    suggestNextInvoiceNumberForTenant(supabase, tenantId, todayInWarsaw()),
  ]);

  return (
    <div className="max-w-4xl">
      <InvoiceForm
        prefill={podpowiedz}
        vatExempt={vatExemptionBasis !== null}
        suggestedNumber={suggestedNumber}
      />
    </div>
  );
}
