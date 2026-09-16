import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  client: vi.fn(), reset: vi.fn(), ip: vi.fn(), turnstile: vi.fn(), limit: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/auth/get-client-ip', () => ({ getClientIp: mocks.ip }));
vi.mock('@/lib/security/turnstile', () => ({ verifyTurnstile: mocks.turnstile }));
vi.mock('@/lib/rate-limit/password', () => ({ checkPasswordRecoveryRequestRateLimit: mocks.limit }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
import { requestPasswordReset } from '@/app/(auth)/forgot-password/actions';
const email = 'fixture@example.test';
function form(value: string | File = email) {
  const data = new FormData(); data.set('email', value); data.set('cf-turnstile-response', 'synthetic-turnstile'); return data;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.client.mockResolvedValue({ auth: { resetPasswordForEmail: mocks.reset } });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.ip.mockResolvedValue('192.0.2.1'); mocks.turnstile.mockResolvedValue({ success: true });
  mocks.limit.mockResolvedValue({ allowed: true, unavailable: false, retryAfter: 0 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('sends PKCE recovery to the configured app and the new reset form', async () => {
  await expect(requestPasswordReset(form(' Fixture@Example.Test '))).rejects.toThrow('redirect:/forgot-password?success=email_sent');
  expect(mocks.reset).toHaveBeenCalledExactlyOnceWith(email, { redirectTo: 'https://app.example.test/auth/callback?next=/reset-password' });
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(email, '192.0.2.1');
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(email);
});
it.each(['', 'missing-domain@', 'x'.repeat(255) + '@example.test', new File(['email'], 'fixture')])('rejects malformed input before Auth %#', async (input) => {
  await expect(requestPasswordReset(form(input))).rejects.toThrow('invalid_email');
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.turnstile).not.toHaveBeenCalled();
});
it.each(['', 'https://app.example.test/path', 'https://user:pass@app.example.test'])('fails closed on missing/invalid configured origin %#', async (origin) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
  await expect(requestPasswordReset(form())).rejects.toThrow('verification_unavailable');
  expect(mocks.reset).not.toHaveBeenCalled();
});
it('rejects file or oversized bot tokens before provider I/O', async () => {
  for (const value of [new File(['token'], 'fixture'), 'x'.repeat(2049)]) {
    const data = form(); data.set('cf-turnstile-response', value);
    await expect(requestPasswordReset(data)).rejects.toThrow('bot_check_failed');
  }
  expect(mocks.turnstile).not.toHaveBeenCalled(); expect(mocks.reset).not.toHaveBeenCalled();
});
it('denies Turnstile failure without consuming a mail budget', async () => {
  mocks.turnstile.mockResolvedValue({ success: false });
  await expect(requestPasswordReset(form())).rejects.toThrow('bot_check_failed');
  expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.reset).not.toHaveBeenCalled();
});
it.each([false, true])('denies exhausted/unavailable email budget (%s)', async (unavailable) => {
  mocks.limit.mockResolvedValue({ allowed: false, unavailable, retryAfter: 120 });
  await expect(requestPasswordReset(form())).rejects.toThrow(unavailable ? 'verification_unavailable' : 'rate_limited&retry=120');
  expect(mocks.reset).not.toHaveBeenCalled();
});
it('does not enumerate account existence or expose returned/thrown provider details', async () => {
  mocks.reset.mockResolvedValueOnce({ error: { message: 'no account private@example.test' } });
  await expect(requestPasswordReset(form())).rejects.toThrow('redirect:/forgot-password?success=email_sent');
  mocks.reset.mockRejectedValueOnce(new Error('token secret details'));
  await expect(requestPasswordReset(form())).rejects.toThrow('redirect:/forgot-password?success=email_sent');
  mocks.client.mockRejectedValueOnce(new Error('private'));
  await expect(requestPasswordReset(form())).rejects.toThrow('redirect:/forgot-password?success=email_sent');
  expect(console.error).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
});
it('fails closed on thrown preflight checks', async () => {
  mocks.ip.mockRejectedValueOnce(new Error('private'));
  await expect(requestPasswordReset(form())).rejects.toThrow('verification_unavailable');
  mocks.turnstile.mockRejectedValueOnce(new Error('private'));
  await expect(requestPasswordReset(form())).rejects.toThrow('bot_check_failed');
  mocks.limit.mockRejectedValueOnce(new Error('private'));
  await expect(requestPasswordReset(form())).rejects.toThrow('verification_unavailable');
  expect(mocks.reset).not.toHaveBeenCalled();
});
