import { prefillFromLastInvoiceAction } from '@/components/invoices/actions';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { loadTenantSellerForForms } from '@/lib/invoices/load-tenant-seller';
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
 *
 * Sprzedawca (P5) idzie wyłącznie do nagłówka dokumentu w układzie Finory.
 * Akcja zapisu i tak czyta go sama z profilu firmy; błąd odczytu tutaj nie
 * blokuje formularza (nagłówek pokaże wtedy link do danych firmy).
 */
export default async function NewRegularInvoicePage() {
  const { supabase, tenantId } = await getPageContext();
  const [podpowiedz, vatExemptionBasis, suggestedNumber, seller] = await Promise.all([
    prefillFromLastInvoiceAction(),
    readTenantVatExemption(supabase, tenantId),
    suggestNextInvoiceNumberForTenant(supabase, tenantId, todayInWarsaw()),
    loadTenantSellerForForms().catch(() => null),
  ]);

  return (
    <InvoiceForm
      prefill={podpowiedz}
      vatExempt={vatExemptionBasis !== null}
      suggestedNumber={suggestedNumber}
      seller={seller}
    />
  );
}
