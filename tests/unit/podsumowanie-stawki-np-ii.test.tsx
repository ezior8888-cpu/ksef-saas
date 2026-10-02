import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InvoiceTotals } from '@/components/invoices/invoice-totals';
import type { InvoiceLineItem, VatRate } from '@/types/invoice';

/**
 * AUD-70: podsumowanie faktury (formularz i podgląd) przy stawce „np_ii”.
 * Mapa opisów nie znała tej stawki, więc wiersz wychodził jako „VAT np_ii%”.
 */

function pozycja(vatRate: VatRate, netAmount: number): InvoiceLineItem {
  return { ordinal: 1, name: 'x', unit: 'usł.', quantity: 1, unitPriceNet: netAmount, vatRate, netAmount, vatAmount: 0, grossAmount: netAmount };
}

function tekst(lines: InvoiceLineItem[]): string {
  const html = renderToStaticMarkup(
    <InvoiceTotals totals={{ netTotal: 2500, vatTotal: 0, grossTotal: 2500 }} lines={lines} />,
  );
  return html.replace(/<[^>]+>/g, ' ');
}

describe('InvoiceTotals: etykieta stawki „np_ii”', () => {
  it('„np. II” zamiast „np_ii%”; „np” bez zmian', () => {
    const t = tekst([pozycja('np_ii', 2000), pozycja('np', 500)]);
    expect(t).toContain('VAT nie podlega (np. II)');
    expect(t).toContain('VAT nie podlega ');
    expect(t).not.toContain('np_ii');
  });
});
