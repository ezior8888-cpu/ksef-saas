import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getConfiguredStripePriceIds,
  mapPriceIdToPlan,
  mapSubscriptionStatus,
  mapSubscriptionToRow,
} from '@/lib/stripe/event-mapping';

function subscriptionWithPrice(priceId?: string): Stripe.Subscription {
  return {
    id: 'sub_price_test',
    customer: 'cus_price_test',
    status: 'active',
    items: {
      has_more: false,
      data: [{ price: { id: priceId ?? '' }, quantity: 1 }],
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly');
  vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_annual');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Stripe Price ID mapping', () => {
  it('maps only the two configured Price IDs', () => {
    expect(getConfiguredStripePriceIds()).toEqual({
      monthly: 'price_monthly',
      annual: 'price_annual',
    });
    expect(mapPriceIdToPlan('price_monthly')).toBe('monthly');
    expect(mapPriceIdToPlan('price_annual')).toBe('annual');
    expect(mapSubscriptionToRow(subscriptionWithPrice('price_annual'), 'tenant-1').plan)
      .toBe('annual');
  });

  it.each([undefined, null, '', 'price_unknown'])(
    'rejects missing or unrecognized Price ID %s before persisting a subscription',
    (priceId) => {
      expect(() => mapPriceIdToPlan(priceId)).toThrow('unrecognized Price ID');
      expect(() => mapSubscriptionToRow(subscriptionWithPrice(priceId ?? undefined), 'tenant-1'))
        .toThrow('unrecognized Price ID');
    },
  );

  it.each([undefined, null, '', 'future_status'])(
    'rejects unknown subscription status %s before writing a local row',
    (status) => {
      expect(() => mapSubscriptionStatus(status)).toThrow('unrecognized status');
      const subscription = {
        ...subscriptionWithPrice('price_monthly'),
        status,
      } as unknown as Stripe.Subscription;
      expect(() => mapSubscriptionToRow(subscription, 'tenant-1')).toThrow(
        'unrecognized status',
      );
    },
  );
  it.each([
    ['two items', { has_more: false, data: [
      { price: { id: 'price_monthly' }, quantity: 1 },
      { price: { id: 'price_annual' }, quantity: 1 },
    ] }],
    ['partial list', { has_more: true, data: [
      { price: { id: 'price_monthly' }, quantity: 1 },
    ] }],
    ['quantity two', { has_more: false, data: [
      { price: { id: 'price_monthly' }, quantity: 2 },
    ] }],
    ['unknown quantity', { has_more: false, data: [
      { price: { id: 'price_monthly' } },
    ] }],
  ])('rejects %s outside the single-unit subscription model', (_case, items) => {
    const subscription = {
      ...subscriptionWithPrice('price_monthly'),
      items,
    } as unknown as Stripe.Subscription;
    expect(() => mapSubscriptionToRow(subscription, 'tenant-1'))
      .toThrow('outside the single-unit plan model');
  });
  it('rejects a missing monthly or annual setting', () => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY', ' ');
    expect(() => getConfiguredStripePriceIds()).toThrow('must both be configured');
    expect(() => mapPriceIdToPlan('price_annual')).toThrow('must both be configured');

    vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly');
    vi.stubEnv('STRIPE_PRICE_ANNUAL', '');
    expect(() => getConfiguredStripePriceIds()).toThrow('must both be configured');
  });

  it('rejects identical monthly and annual Price IDs, including whitespace', () => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY', ' price_same ');
    vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_same');
    expect(() => getConfiguredStripePriceIds()).toThrow('must be distinct');
    expect(() => mapPriceIdToPlan('price_same')).toThrow('must be distinct');
  });
});
