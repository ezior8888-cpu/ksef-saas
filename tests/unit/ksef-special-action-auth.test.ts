import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  enqueue: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: mocks.requireAuth,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));
vi.mock('@/lib/invoices/ksef-submit-enqueue', () => ({
  enqueueKsefSubmitAfterDraft: mocks.enqueue,
}));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  saveAdvanceAction,
  saveAndSendAdvanceAction,
} from '@/components/invoices/advance-actions';
import {
  saveFinalAction,
  saveAndSendFinalAction,
} from '@/components/invoices/final-actions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
});

afterEach(() => vi.unstubAllEnvs());

describe('special invoice actions', () => {
  it.each([
    ['advance draft', () => saveAdvanceAction({})],
    ['advance send', () => saveAndSendAdvanceAction({})],
    ['final draft', () => saveFinalAction({})],
    ['final send', () => saveAndSendFinalAction({})],
  ])('denies %s before any tenant read, write or enqueue when MFA is pending', async (_label, action) => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Wymagana weryfikacja dwuetapowa'));
    const result = await action();

    expect(result).toMatchObject({
      success: false,
      error: 'Wymagana weryfikacja dwuetapowa',
    });
    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
