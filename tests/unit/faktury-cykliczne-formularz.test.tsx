// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ saveDraft: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/invoices/actions', () => ({
  saveDraftAction: m.saveDraft,
  saveAndSendInvoiceAction: vi.fn(),
  lookupBuyerAction: vi.fn(),
  prefillFromLastInvoiceAction: vi.fn(),
}));

import { InvoiceForm } from '@/components/invoices/invoice-form';
import type { InvoiceFormValues } from '@/lib/schemas/invoice-form';

const POS = '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d';

/**
 * Plan Finora N1: podkład (`?cykliczna=`, `?wzor=`) wpisany od razu
 * w formularz i ukryte pole pozycji cyklicznej, które dochodzi do akcji
 * zapisu. Bez podkładu formularz jak dotąd.
 */

const podklad: Partial<InvoiceFormValues> = {
  internalNumber: 'FV/2/10/2026',
  issueDate: '2026-10-20',
  saleDate: '2026-10-20',
  paymentDueDate: '2026-11-03',
  buyerNip: '5252241585',
  buyerName: 'Klient Podkład',
  buyerAddressLine1: 'ul. B 2',
  buyerAddressLine2: '00-002 Warszawa',
  paymentMethod: 'transfer',
  bankAccount: 'PL61109010140000071219812874',
  lines: [{ name: 'Abonament miesięczny', unit: 'mies.', quantity: 1, unitPriceNet: 500, vatRate: '23' }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
  m.saveDraft.mockReset().mockResolvedValue({ success: false, error: 'stop' });
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function input(name: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`brak pola ${name}`);
  return el;
}

async function zapiszSzkic() {
  const przycisk = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Szkic');
  await act(async () => {
    przycisk!.click();
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('formularz faktury — podkład i pozycja cykliczna', () => {
  it('podkład w polach od pierwszego renderu; pozycja cykliczna dochodzi do akcji zapisu', async () => {
    await act(async () => {
      root.render(<InvoiceForm initialValues={podklad} recurringInvoiceId={POS} suggestedNumber="FV/9/10/2026" />);
    });
    expect(input('buyerName').value).toBe('Klient Podkład');
    expect(input('internalNumber').value).toBe('FV/2/10/2026');
    expect(input('lines.0.name').value).toBe('Abonament miesięczny');
    expect(input('recurringInvoiceId').type).toBe('hidden');
    expect(input('recurringInvoiceId').value).toBe(POS);

    await zapiszSzkic();
    expect(m.saveDraft).toHaveBeenCalledTimes(1);
    expect(m.saveDraft.mock.calls[0]![0]).toMatchObject({ recurringInvoiceId: POS, buyerName: 'Klient Podkład' });
  });

  it('„Duplikuj” (podkład bez pozycji) — bez ukrytego pola i bez recurringInvoiceId w zapisie', async () => {
    await act(async () => {
      root.render(<InvoiceForm initialValues={podklad} />);
    });
    expect(container.querySelector('input[name="recurringInvoiceId"]')).toBeNull();
    await zapiszSzkic();
    expect(m.saveDraft.mock.calls[0]![0]).not.toHaveProperty('recurringInvoiceId');
  });
});
