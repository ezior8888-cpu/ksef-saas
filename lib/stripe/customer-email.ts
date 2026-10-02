import { getStripe } from '@/lib/stripe/client';

/**
 * Adres e-mail klienta w Stripe = osoba, która teraz zarządza subskrypcją
 * (AUD-78). Stripe wysyła na niego paragony i przypomnienia o płatności;
 * do 02.10 ustawiał się tylko przy zakładaniu klienta i zostawał przy
 * byłym adminie. Wołane przed sesją Checkout/Portal dla istniejącego klienta.
 */
export async function syncStripeCustomerEmail(customerId: string, email: string | null): Promise<void> {
  const target = email?.trim();
  if (!target) return;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return;
  if ((customer.email ?? '').toLowerCase() === target.toLowerCase()) return;
  await stripe.customers.update(customerId, { email: target });
}
