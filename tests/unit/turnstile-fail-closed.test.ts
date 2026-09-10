import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
import { verifyTurnstile } from '@/lib/security/turnstile';

describe('Turnstile configuration fail closed', () => {
  beforeEach(() => {
    for (const key of ['APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'VERCEL_ENV', 'TURNSTILE_SECRET_KEY', 'LOAD_TEST_MODE']) vi.stubEnv(key, '');
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(['production', '', 'test'])('does not bypass a missing secret in runtime %s', async (runtime) => {
    vi.stubEnv('NODE_ENV', runtime);
    expect(await verifyTurnstile(null)).toEqual({ success: false, errors: ['not-configured'] });
  });
  it('keeps local development usable without Cloudflare', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await verifyTurnstile(null)).toEqual({ success: true, skipped: true });
  });
  it('does not bypass a production marker even with development NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'production');
    expect((await verifyTurnstile(null)).success).toBe(false);
  });
});
