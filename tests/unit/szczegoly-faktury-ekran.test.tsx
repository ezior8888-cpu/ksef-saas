// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * F-094 (audyt bloku 1): szczegóły faktury na ekranie.
 *  - Strona pobierała `payment_data`, ale go nie pokazywała: po otwarciu
 *    faktury nie było widać terminu, formy płatności ani rachunku.
 *  - Ilość i cena przez `toFixed(2)`: 100,1234 jako „100.12” — inaczej niż
 *    PDF i XML (F-069), z kropką zamiast przecinka.
 *  - Nabywca z numerem VAT UE bez identyfikatora; czas przyjęcia w KSeF jako
 *    surowy znacznik ISO w UTC (część F-091).
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return { channel: () => ch, removeChannel: vi.fn() };
  },
}));
vi.mock('@/components/invoices/invoice-actions', () => ({ InvoiceActions: () => null }));
vi.mock('@/components/invoices/upo-download', () => ({ UpoDownload: () => null }));
vi.mock('@/components/invoices/error-display', () => ({ InvoiceErrorDisplay: () => null }));

import { InvoiceDetailView, type InvoiceDetailInitial } from '@/components/invoices/invoice-detail-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const base: InvoiceDetailInitial = {
  id: 'inv-1',
  internal_number: 'FV/7/10/2026',
  invoice_type: 'VAT',
  issue_date: '2026-10-02',
  sale_date: '2026-10-02',
  ksef_status: 'accepted',
  ksef_number: '5260001246-20261002-0100A0B0C0D0-E1',
  ksef_accepted_at: '2026-10-02T05:12:33.123+00:00',
  xml_storage_path: null,
  net_total: '18000.19',
  vat_total: '4140.04',
  gross_total: '22140.23',
  notes: null,
  last_error: null,
  last_error_code: null,
  last_error_field: null,
  last_error_suggestion: null,
  seller_data: { nip: '5260001246', name: 'Moja Firma', address: { addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
  buyer_data: { nip: '5252241585', name: 'Klient', address: { addressLine1: 'ul. B 2', addressLine2: '02-001 Warszawa' } },
  payment_data: {
    method: 'transfer',
    dueDate: '2026-10-16',
    bankAccount: 'PL61109010140000071219812874',
    currency: 'PLN',
    amountDue: 22140.23,
  },
  lines: [
    { ordinal: 1, name: 'Usługa', unit: 'h', quantity: '1.5', unit_price_net: '100.1234', vat_rate: '23', gross_amount: '184.73' },
  ],
  upo_status: null,
};

function render(initial: InvoiceDetailInitial) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<InvoiceDetailView initial={initial} />));
  // pl-PL grupuje tysiące spacją nierozdzielającą (U+00A0).
  return (host.textContent ?? '').replace(/\u00a0/g, ' ');
}

describe('szczegóły faktury na ekranie (F-094)', () => {
  it('pokazuje formę, termin płatności i rachunek', () => {
    const t = render(base);
    expect(t).toContain('Przelew');
    expect(t).toContain('2026-10-16');
    expect(t).toContain('PL61109010140000071219812874');
  });

  it('ilość i cena w całości, kwoty po polsku', () => {
    const t = render(base);
    expect(t).toContain('100,1234');
    expect(t).toContain('1,50');
    expect(t).toContain('184,73');
    expect(t).toContain('18 000,19');
    expect(t).not.toContain('100.12');
  });

  it('nabywca z numerem VAT UE ma identyfikator z etykietą', () => {
    const t = render({
      ...base,
      buyer_data: { vatUeNumber: 'DE123456789', name: 'Kunde GmbH', address: { addressLine1: 'Hauptstr. 1', addressLine2: '10115 Berlin' } },
    });
    expect(t).toContain('VAT UE: DE123456789');
  });

  it('czas przyjęcia w KSeF po polsku, w strefie Europe/Warsaw', () => {
    const t = render(base);
    expect(t).toContain('02.10.2026, 07:12');
    expect(t).not.toContain('2026-10-02T05:12');
  });

  it('faktura bez danych płatności (stary rekord) renderuje się bez sekcji płatności', () => {
    const t = render({ ...base, payment_data: null });
    expect(t).not.toContain('Termin płatności');
    expect(t).toContain('FV/7/10/2026');
  });
});
