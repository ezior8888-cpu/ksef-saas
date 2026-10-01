import { amountDueOnPdf } from '@/lib/pdf/invoice-renderer';
import type { Invoice } from '@/types/invoice';

/**
 * Kwota w mailu z fakturą — ta sama, co „Do zapłaty” na PDF w załączniku.
 *
 * Faktura rozliczeniowa (ROZ) ma w `grossTotal` pełną wartość zamówienia;
 * do zapłaty jest reszta po zaliczkach (art. 106f ust. 3, #84). Do 01.10.2026
 * mail podawał przy ROZ „Kwota brutto: <całe zamówienie>” obok terminu
 * płatności, a PDF „Do zapłaty: <reszta>” — nabywca dostawał dwie kwoty.
 */
export function invoiceEmailAmount(invoice: Invoice): { caption: string; label: string } {
  const amount = amountDueOnPdf(invoice);
  const label = `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
  return {
    caption: invoice.type === 'ROZ' ? 'Do zapłaty (po zaliczkach)' : 'Kwota brutto',
    label,
  };
}
