import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  verification: vi.fn(),
  send: vi.fn(),
  offline: vi.fn(),
  health: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerification: mocks.verification,
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: mocks.health }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.offline }));

import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { ROZ_SUBMISSION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';

const noDatabaseAccess = { from: vi.fn() } as unknown as SupabaseClient;

function params(invoiceType: Invoice['type'], auditKind: 'regular' | 'final') {
  return {
    supabase: noDatabaseAccess,
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    invoiceId: '11111111-1111-4111-8111-111111111111',
    nip: '1234567890',
    invoice: { type: invoiceType, internalNumber: 'FR/1' } as Invoice,
    auditKind,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ROZ submission hold at shared enqueue boundary', () => {
  it.each([
    ['ROZ', 'regular'],
    ['VAT', 'final'],
  ] as const)('blocks invoice type %s with audit kind %s before online or Offline24 work', async (type, kind) => {
    const result = await enqueueKsefSubmitAfterDraft(params(type, kind));
    expect(result).toEqual({ ok: false, error: ROZ_SUBMISSION_HOLD_MESSAGE });
    expect(noDatabaseAccess.from).not.toHaveBeenCalled();
    expect(mocks.verification).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.offline).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('blocks a final payload even if the caller labels the event VAT', async () => {
    const result = await enqueueKsefSubmitAfterDraft({
      ...params('VAT', 'regular'),
      finalAdvanceSettlementRows: [],
    });
    expect(result).toEqual({ ok: false, error: ROZ_SUBMISSION_HOLD_MESSAGE });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
