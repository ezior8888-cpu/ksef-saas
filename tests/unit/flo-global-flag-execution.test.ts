import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  result: { data: { enabled: false }, error: null } as {
    data: unknown; error: { message: string } | null;
  },
  read: vi.fn(),
  eq: vi.fn(),
  cached: vi.fn(),
}));
vi.mock('@/lib/cache', () => ({ cached: mock.cached }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (key: string, value: string) => {
          mock.eq(key, value);
          return { maybeSingle: async () => { mock.read(); return mock.result; } };
        },
      }),
    }),
  }),
}));
import { getGlobalFlagForExecution } from '@/lib/feature-flags/global-flags';
beforeEach(() => {
  mock.result = { data: { enabled: false }, error: null };
  mock.eq.mockClear(); mock.read.mockClear(); mock.cached.mockClear();
});
describe('FLO authoritative kill switch read', () => {
  it.each([true, false])('returns a verified boolean %s without stale cache', async (enabled) => {
    mock.result.data = { enabled };
    expect(await getGlobalFlagForExecution('killFloAgent')).toBe(enabled);
    expect(mock.eq).toHaveBeenCalledWith('flag', 'killFloAgent');
    expect(mock.cached).not.toHaveBeenCalled();
  });
  it('keeps default false only after a successful missing-row lookup', async () => {
    mock.result.data = null;
    expect(await getGlobalFlagForExecution('killFloAgent')).toBe(false);
    expect(mock.read).toHaveBeenCalledOnce();
  });
  it('throws for lookup failure rather than treating kill as false', async () => {
    mock.result = { data: null, error: { message: 'synthetic failure' } };
    await expect(getGlobalFlagForExecution('killFloAgent')).rejects.toThrow();
  });
  it.each([undefined, {}, { enabled: 'false' }])('rejects malformed flag response %j', async (data) => {
    mock.result.data = data;
    await expect(getGlobalFlagForExecution('killFloAgent')).rejects.toThrow();
  });
});
