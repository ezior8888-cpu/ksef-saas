import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), decrypt: vi.fn(), health: vi.fn(), offlineAdd: vi.fn(),
  send: vi.fn(), audit: vi.fn(), environment: vi.fn(),
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

import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
let writes: number;
const supabase = {
  from(table: string) {
    if (table !== 'tenants') throw new Error(`Unexpected table: ${table}`);
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: { ksef_credentials_encrypted: 'ZmFrZQ==' }, error: null }),
      update: () => { writes += 1; return query; },
    };
    return query;
  },
} as unknown as SupabaseClient;

const base = {
  supabase, tenantId, userId: '33333333-3333-4333-8333-333333333333',
  invoiceId, nip: '1234567890', invoice: { internalNumber: 'TEST-1' } as Invoice,
};

beforeEach(() => {
  vi.clearAllMocks();
  writes = 0;
  mocks.decrypt.mockReturnValue({ type: 'xades', certificatePem: 'fixture-pem' });
  mocks.health.mockResolvedValue({ offline: true, isMfOutage: true, reason: 'KSeF down' });
  mocks.environment.mockReturnValue('test');
});

describe('special invoice enqueue under KSeF outage', () => {
  it.each(['correction', 'advance', 'final'] as const)(
    'keeps a %s draft instead of returning false Offline24 success', async (auditKind) => {
      const result = await enqueueKsefSubmitAfterDraft({ ...base, auditKind });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('szkic') });
      expect(mocks.offlineAdd).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(writes).toBe(0);
    },
  );

  it('preserves ordinary VAT Offline24 routing', async () => {
    const result = await enqueueKsefSubmitAfterDraft({ ...base, auditKind: 'regular' });
    expect(result).toEqual({ ok: true, mode: 'offline_queued' });
    expect(mocks.offlineAdd).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('keeps an ordinary VAT draft on a PROD outage without issuing an Offline24 QR', async () => {
    mocks.environment.mockReturnValue('production');
    const result = await enqueueKsefSubmitAfterDraft({ ...base, auditKind: 'regular' });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Offline24 w PROD') });
    expect(mocks.health).toHaveBeenCalledWith('production');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(writes).toBe(0);
  });

  it('blocks PROD final settlement before checking health or sending an event', async () => {
    mocks.environment.mockReturnValue('production');
    const result = await enqueueKsefSubmitAfterDraft({ ...base, auditKind: 'final' });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('blocks PROD correction before checking health or sending an event', async () => {
    mocks.environment.mockReturnValue('production');
    const result = await enqueueKsefSubmitAfterDraft({ ...base, auditKind: 'correction' });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
