import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ customers: { retrieve: s.retrieve, update: s.update } }),
}));

import { syncStripeCustomerEmail } from '@/lib/stripe/customer-email';

/**
 * AUD-78: e-mail klienta w Stripe ustawiał się tylko przy tworzeniu
 * klienta. Po zmianie właściciela paragony i przypomnienia o płatności
 * szły dalej do byłego admina. Teraz przy każdym wejściu w płatności
 * adres osoby zarządzającej subskrypcją trafia do Stripe.
 */

beforeEach(() => {
  s.retrieve.mockReset();
  s.update.mockReset().mockResolvedValue({});
});

describe('e-mail klienta Stripe', () => {
  it('inny adres w Stripe — aktualizacja', async () => {
    s.retrieve.mockResolvedValue({ id: 'cus_1', email: 'byly.admin@example.test' });
    await syncStripeCustomerEmail('cus_1', 'wlasciciel@example.test');
    expect(s.update).toHaveBeenCalledWith('cus_1', { email: 'wlasciciel@example.test' });
  });

  it('ten sam adres (inna wielkość liter) — bez zapisu', async () => {
    s.retrieve.mockResolvedValue({ id: 'cus_1', email: 'Wlasciciel@Example.test' });
    await syncStripeCustomerEmail('cus_1', 'wlasciciel@example.test');
    expect(s.update).not.toHaveBeenCalled();
  });

  it('klient usunięty w Stripe albo brak adresu — nic', async () => {
    s.retrieve.mockResolvedValue({ id: 'cus_1', deleted: true });
    await syncStripeCustomerEmail('cus_1', 'wlasciciel@example.test');
    await syncStripeCustomerEmail('cus_1', null);
    expect(s.update).not.toHaveBeenCalled();
  });
});
