import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
import { logAudit } from '@/lib/audit/log';
import { logAuditSystem } from '@/lib/audit/log-system';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
});
afterEach(() => vi.restoreAllMocks());

describe.each([['request', logAudit], ['system', logAuditSystem]] as const)('%s audit failures', (_, write) => {
  it.each(['returned', 'thrown', 'initialization'])('keeps %s errors and event metadata out of console', async (mode) => {
    const sentinel = 'private-invoice-body-and-email@example.test';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (mode === 'returned') mocks.insert.mockResolvedValue({ error: { message: sentinel } });
    if (mode === 'thrown') mocks.insert.mockRejectedValue(new Error(sentinel));
    if (mode === 'initialization') mocks.admin.mockImplementation(() => { throw new Error(sentinel); });
    await expect(write({ action: 'gdpr.export_requested', tenantId: null,
      userId: sentinel, metadata: { invoice: sentinel } })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
    expect(log.mock.calls[0]).toHaveLength(1);
  });

  it('still stores the intended event in the access-controlled audit table', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: null });
    await write({ action: 'gdpr.export_requested', tenantId: null, userId: 'fixture-user',
      metadata: { reason: 'fixture-event' } });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'fixture-user',
      metadata: expect.objectContaining({ reason: 'fixture-event' }) }));
    expect(log).not.toHaveBeenCalled();
  });
});
