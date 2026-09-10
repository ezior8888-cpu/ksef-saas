import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send, canSendTo } = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ data: { id: 'message-1' }, error: null }),
  canSendTo: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
vi.mock('@/lib/email/preferences', () => ({ canSendTo }));
vi.mock('@/lib/email/unsubscribe-token', () => ({
  isUnsubscribeConfigured: () => false,
  createUnsubscribeToken: vi.fn(),
}));

describe('development recipient override', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'test-placeholder');
    vi.stubEnv('RESEND_DEV_TO_OVERRIDE', 'developer@example.test');
    for (const key of ['APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'VERCEL_ENV']) vi.stubEnv(key, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['production', '', 'unknown'])('keeps the real recipient and preference checks with NODE_ENV=%s', async (runtime) => {
    vi.stubEnv('NODE_ENV', runtime);
    const { sendEmail } = await import('@/lib/email/send');
    await sendEmail({ to: 'recipient@example.test', subject: 'Invoice', html: '<p>Test</p>' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['recipient@example.test'], subject: 'Invoice' }));
    expect(canSendTo).toHaveBeenCalled();
  });

  it('keeps explicit local development behavior', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { sendEmail } = await import('@/lib/email/send');
    await sendEmail({ to: 'recipient@example.test', subject: 'Invoice', html: '<p>Test</p>' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['developer@example.test'] }));
  });
});
