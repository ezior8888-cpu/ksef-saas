import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice } from '@/types/invoice';
import type { FinalInvoiceData } from '@/types/invoice-types';

/**
 * C-10 (03.10.2026): warstwa 1 — blokada ROZ „wszędzie” — zdjęta. Treść ROZ
 * i rozliczenie zaliczek czyta `assertSubmitReferences` z bazy przy każdej
 * wysyłce (`lib/ksef/submit-reference-boundary.ts`), nie z eventu kolejki,
 * tak jak ZAL. Zostaje tylko warstwa 2 (PROD) przy kolejkowaniu —
 * ten plik testuje właśnie ją, odwrotnie niż przed C-10: TEST przechodzi
 * do zwykłej kolejki, PROD zostaje wstrzymany.
 */

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  decrypt: vi.fn(),
  health: vi.fn(),
  offlineAdd: vi.fn(),
  send: vi.fn(),
  audit: vi.fn(),
  environment: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerification: mocks.verify,
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/ksef/credentials-crypto', () => ({ decryptCredentials: mocks.decrypt }));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: mocks.health }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.offlineAdd }));
vi.mock('@/lib/ksef/claim-environment', () => ({ requireConfiguredKsefEnvironment: mocks.environment }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
// Blob poświadczeń czytany kluczem serwisowym (AUD-103) — ta sama atrapa
// serwuje też aktualizację statusu `queued`, wołaną przez `params.supabase`.
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => supabase }));
vi.mock('@/lib/ksef/submission-holds', async (orig) => ({
  ...(await orig<typeof import('@/lib/ksef/submission-holds')>()),
  isKsefSubmissionPaused: async () => false,
}));

import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { ROZ_PRODUCTION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';

const supabase = {
  from() {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: { ksef_credentials_encrypted: 'ZmFrZQ==' }, error: null }),
      update: () => query,
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return query;
  },
} as unknown as SupabaseClient;

const finalData = { invoiceType: 'final', internalNumber: 'FR/1' } as FinalInvoiceData;

const base = {
  supabase,
  tenantId,
  userId: '33333333-3333-4333-8333-333333333333',
  invoiceId,
  nip: '1234567890',
  invoice: { type: 'ROZ', internalNumber: 'FR/1' } as Invoice,
  finalData,
  auditKind: 'final' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decrypt.mockReturnValue({ type: 'xades', certificatePem: 'fixture-pem' });
});
afterEach(() => vi.unstubAllEnvs());

describe('ROZ submission hold — tylko warstwa PROD zostaje (C-10)', () => {
  it('holds a ROZ submission on PRODUCTION before checking health or sending an event', async () => {
    mocks.environment.mockReturnValue('production');
    const result = await enqueueKsefSubmitAfterDraft(base);
    expect(result).toEqual({ ok: false, error: ROZ_PRODUCTION_HOLD_MESSAGE });
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('lets a ROZ submission through on TEST, to the ordinary submit queue', async () => {
    mocks.environment.mockReturnValue('test');
    const result = await enqueueKsefSubmitAfterDraft(base);
    expect(result).toEqual({ ok: true, mode: 'online_queued' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
  });

  it('carries finalData through to the queued event, not a settlement row array', async () => {
    mocks.environment.mockReturnValue('test');
    await enqueueKsefSubmitAfterDraft(base);
    const sent = mocks.send.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(sent.data.finalData).toBe(finalData);
    expect(sent.data).not.toHaveProperty('finalAdvanceSettlementRows');
  });
});
