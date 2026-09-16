import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), remove: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
import { deleteAllRecoveryCodes } from '@/lib/auth/mfa-recovery';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ delete: mocks.remove });
  mocks.remove.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
});
it('deletes legacy codes only for the authorized user', async () => {
  await expect(deleteAllRecoveryCodes('fixture-user')).resolves.toBeUndefined();
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('mfa_recovery_codes');
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('user_id', 'fixture-user');
});
it('does not silently accept a rejected cleanup or expose the database message', async () => {
  mocks.eq.mockResolvedValue({ error: { message: 'synthetic-private-detail' } });
  await expect(deleteAllRecoveryCodes('fixture-user')).rejects.toThrow(/^recovery_codes_cleanup_failed$/);
});
it('propagates an unavailable database as failure for the action to handle', async () => {
  mocks.eq.mockRejectedValue(new Error('fixture-unavailable'));
  await expect(deleteAllRecoveryCodes('fixture-user')).rejects.toThrow('fixture-unavailable');
});
