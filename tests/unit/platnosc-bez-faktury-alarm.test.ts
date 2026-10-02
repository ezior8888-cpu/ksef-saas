import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alertCritical: vi.fn(),
  count: 0 as number | null,
  filters: [] as string[],
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn(async () => true) }));
vi.mock('@/lib/jobs/events', () => ({ inngest: { createFunction: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { mocks.filters.push(`${table}.${k}=${String(v)}`); return q; },
        is: (k: string, v: unknown) => { mocks.filters.push(`${table}.${k} is ${String(v)}`); return q; },
        lt: (k: string) => { mocks.filters.push(`${table}.${k}<`); return q; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: mocks.count, error: null }).then(ok),
      });
      return q;
    },
  }),
}));

import { checkPaidWithoutVatInvoice } from '@/lib/jobs/runners/critical-alerts-monitor';

/**
 * AUD-40: płatność Stripe opłacona, a faktura VAT nie powstała (np. brak
 * FAKTFLOW_OPERATOR_TENANT_ID — job kończy się „skipped”) — nikt się nie
 * dowiadywał. Klient zapłacił, a dokumentu sprzedaży nie ma.
 */

beforeEach(() => {
  mocks.alertCritical.mockReset().mockResolvedValue({ delivered: true });
  mocks.count = 0;
  mocks.filters = [];
});

describe('opłacona płatność bez faktury VAT', () => {
  it('jest taka płatność starsza niż godzina — alarm', async () => {
    mocks.count = 2;

    const out = await checkPaidWithoutVatInvoice();

    expect(out).toMatchObject({ type: 'paid_without_vat_invoice', fired: true });
    expect(mocks.alertCritical).toHaveBeenCalledTimes(1);
    expect(mocks.filters).toEqual(expect.arrayContaining([
      'stripe_payments.status=succeeded',
      'stripe_payments.vat_invoice_id is null',
      'stripe_payments.paid_at<',
    ]));
  });

  it('brak — cisza', async () => {
    await expect(checkPaidWithoutVatInvoice()).resolves.toMatchObject({ fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('nieznana liczba — błąd, nie cisza', async () => {
    mocks.count = null;
    await expect(checkPaidWithoutVatInvoice()).rejects.toThrow();
  });
});
