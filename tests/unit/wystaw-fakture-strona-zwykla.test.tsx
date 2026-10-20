import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  formProps: [] as Array<Record<string, unknown>>,
  loadSeller: vi.fn(),
}));

vi.mock('@/lib/supabase/page-context', () => ({
  getPageContext: vi.fn().mockResolvedValue({ supabase: {}, tenantId: 'tenant-a' }),
}));
vi.mock('@/components/invoices/actions', () => ({
  prefillFromLastInvoiceAction: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/invoices/vat-exemption', () => ({
  readTenantVatExemption: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/invoices/next-number', () => ({
  suggestNextInvoiceNumberForTenant: vi.fn().mockResolvedValue('FV/1/10/2026'),
}));
vi.mock('@/lib/invoices/load-tenant-seller', () => ({ loadTenantSellerForForms: m.loadSeller }));
vi.mock('@/components/invoices/invoice-form', () => ({
  InvoiceForm: (props: Record<string, unknown>) => {
    m.formProps.push(props);
    return null;
  },
}));

import NewRegularInvoicePage from '@/app/(dashboard)/invoices/new/regular/page';

/**
 * P5: strona faktury zwykłej dokłada sprzedawcę do nagłówka dokumentu.
 * To tylko wyświetlanie — błąd odczytu nie może zablokować formularza,
 * a numer, podkład i zwolnienie z VAT idą do formularza jak przed P5.
 */
describe('strona /invoices/new/regular — sprzedawca w nagłówku', () => {
  beforeEach(() => {
    m.formProps.length = 0;
    m.loadSeller.mockReset();
  });

  it('przekazuje sprzedawcę z profilu firmy obok numeru i podkładu', async () => {
    const seller = {
      nip: '1234567890', name: 'Firma',
      address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' },
    };
    m.loadSeller.mockResolvedValue(seller);
    renderToStaticMarkup(await NewRegularInvoicePage());
    expect(m.formProps.at(-1)).toMatchObject({
      seller,
      suggestedNumber: 'FV/1/10/2026',
      prefill: null,
      vatExempt: false,
    });
  });

  it('błąd odczytu sprzedawcy nie blokuje formularza (seller = null)', async () => {
    m.loadSeller.mockRejectedValue(new Error('admin client unavailable'));
    renderToStaticMarkup(await NewRegularInvoicePage());
    expect(m.formProps.at(-1)).toMatchObject({ seller: null, suggestedNumber: 'FV/1/10/2026' });
  });
});
