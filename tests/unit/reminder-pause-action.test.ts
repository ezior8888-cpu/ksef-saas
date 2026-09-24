import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndTenant: mocks.auth,
  requireOrgRole: mocks.auth,
  ActionAuthError: class ActionAuthError extends Error {},
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/reminders/prepare-delivery', () => ({ buildReminderDelivery: vi.fn() }));
vi.mock('@/lib/reminders/scheduler', () => ({ decideNextReminder: vi.fn() }));
vi.mock('@/lib/reminders/delivery-consent', () => ({ hasReminderDispatch: vi.fn() }));
vi.mock('@/lib/flo/kind-switch', () => ({ isKindEnabledForTenant: vi.fn() }));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: vi.fn() }));

import { toggleInvoiceRemindersAction } from '@/app/actions/reminders';
import { ActionAuthError } from '@/lib/supabase/auth-context';

const INVOICE = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => { throw new Error('Direct table write is forbidden'); });
  mocks.auth.mockResolvedValue({
    tenantId: TENANT,
    user: { id: '33333333-3333-4333-8333-333333333333' },
    supabase: { rpc: mocks.rpc, from: mocks.from },
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('pause reminder action with a narrow database operation', () => {
  it('pauses the invoice and pending reminders through one authenticated RPC', async () => {
    expect(await toggleInvoiceRemindersAction(INVOICE, true, 'Na prośbę klienta'))
      .toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('set_invoice_reminders_paused', {
      p_invoice_id: INVOICE, p_paused: true, p_reason: 'Na prośbę klienta',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith('/invoices/' + INVOICE);
    expect(mocks.revalidate).toHaveBeenCalledWith('/payments/overdue');
  });

  it('resumes with no stale reason', async () => {
    expect(await toggleInvoiceRemindersAction(INVOICE, false, 'ignored'))
      .toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith('set_invoice_reminders_paused', {
      p_invoice_id: INVOICE, p_paused: false, p_reason: null,
    });
  });

  it.each([{ data: false, error: null }, { data: null, error: { message: 'private-db-error' } }])
    ('does not claim success on an absent invoice or database failure', async (result) => {
      mocks.rpc.mockResolvedValue(result);
      const outcome = await toggleInvoiceRemindersAction(INVOICE, true);
      expect(outcome.success).toBe(false);
      expect(JSON.stringify(outcome)).not.toContain('private-db-error');
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });

  it('does not call the RPC without an authorized session', async () => {
    mocks.auth.mockRejectedValue(new ActionAuthError('Brak dostępu'));
    expect(await toggleInvoiceRemindersAction(INVOICE, true))
      .toEqual({ success: false, error: 'Brak dostępu' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['not-a-uuid', true, undefined],
    [INVOICE, 'true', undefined],
    [INVOICE, true, 'x'.repeat(501)],
  ])('rejects malformed input before authentication', async (invoiceId, paused, reason) => {
    expect((await toggleInvoiceRemindersAction(
      invoiceId as string, paused as boolean, reason as string | undefined,
    )).success).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
