import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  email: vi.fn(),
  push: vi.fn(),
  proposal: vi.fn(),
  order: [] as string[],
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantAdminEmail: async (id: string) => `admin-${id}@firma.test`,
}));
vi.mock('@/lib/email/send', () => ({ sendCertExpiryAlert: mocks.email }));
vi.mock('@/lib/push/sender', () => ({ sendPushToTenant: mocks.push }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: mocks.proposal }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      // Każdy próg widzi te same dwie firmy — wystarczy do sprawdzenia kanałów.
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { id: 't1', nip: '1', name: 'Firma 1', ksef_certificate_expiry: new Date(Date.now() + 7 * 864e5).toISOString() },
            { id: 't2', nip: '2', name: 'Firma 2', ksef_certificate_expiry: new Date(Date.now() + 7 * 864e5).toISOString() },
          ],
          error: null,
        }).then(ok),
    });
    return { from: () => q };
  },
}));

import { runCertExpiryAlert } from '@/lib/inngest/jobs/cert-expiry-alert';

/**
 * Ostrzeżenie o wygasającym certyfikacie ma okno jednego dnia. Karta Flo
 * (X-03) to dodatek — jej awaria nie może zablokować maila ani pusha,
 * ani kolejnych firm. (Uwaga recenzji ChatGPT nr 6, 25.09.2026.)
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: {
    run: async (name, fn) => {
      mocks.order.push(name);
      return fn();
    },
    sleep: vi.fn(),
    sendEvent: vi.fn(),
    scheduleAfter: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order = [];
  mocks.email.mockResolvedValue({ sent: true });
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});

describe('certyfikat KSeF: kanały ostrzeżenia', () => {
  it('awaria karty Flo nie blokuje maili ani kolejnych firm', async () => {
    mocks.proposal.mockRejectedValue(new Error('flo_proposals niedostępne'));

    await expect(runCertExpiryAlert(ctx)).resolves.toBeDefined();

    const adresaci = mocks.email.mock.calls.map((c) => c[0]);
    expect(adresaci).toContain('admin-t1@firma.test');
    expect(adresaci).toContain('admin-t2@firma.test');
    expect(mocks.push).toHaveBeenCalled();
  });

  it('mail i push idą PRZED kartą (karta nie może ich opóźnić)', async () => {
    mocks.proposal.mockResolvedValue({ status: 'created' });
    await runCertExpiryAlert(ctx);

    const t1 = mocks.order.filter((n) => n.includes('t1'));
    expect(t1[0]).toMatch(/^alert-t1-/);
    expect(t1[1]).toMatch(/^flo-cert-card-t1-/);
  });
});
