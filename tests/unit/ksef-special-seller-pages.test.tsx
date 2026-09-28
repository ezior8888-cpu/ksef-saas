import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/invoices/load-tenant-seller', () => ({
  loadTenantSellerForForms: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/invoices/advance-form', () => ({ AdvanceInvoiceForm: () => null }));
vi.mock('@/components/invoices/final-form', () => ({ FinalInvoiceForm: () => null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => { throw new Error('No invoice query when seller is incomplete'); }),
}));

import NewAdvanceInvoicePage from '@/app/(dashboard)/invoices/new/advance/page';
import NewFinalInvoicePage from '@/app/(dashboard)/invoices/new/final/page';

describe('special invoice pages with an incomplete company profile', () => {
  it.each([
    ['ZAL', NewAdvanceInvoicePage],
    ['ROZ', NewFinalInvoicePage],
  ])('blocks %s issuance and points to the existing company profile', async (_kind, page) => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('Wystawianie faktury jest wstrzymane');
    expect(html).toContain('profil istniejącej firmy');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('/onboarding');
  });
});
