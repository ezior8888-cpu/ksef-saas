'use server';

import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logAudit } from '@/lib/audit/log';
import { getClientIp } from '@/lib/auth/get-client-ip';
import { getTrustedAppOrigin } from '@/lib/auth/trusted-origin';
import { checkPasswordRecoveryRequestRateLimit } from '@/lib/rate-limit/password';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { createClient } from '@/lib/supabase/server';

/** Uniform result for existing/missing accounts and provider errors. */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (email.length > 254 || !z.email().safeParse(email).success) {
    redirect('/forgot-password?error=invalid_email');
  }
  const origin = getTrustedAppOrigin();
  if (!origin) redirect('/forgot-password?error=verification_unavailable');

  const ip = await getClientIp().catch(() => null);
  if (!ip) redirect('/forgot-password?error=verification_unavailable');
  const token = formData.get('cf-turnstile-response');
  if (token !== null && (typeof token !== 'string' || token.length > 2048)) {
    redirect('/forgot-password?error=bot_check_failed');
  }
  const turnstile = await verifyTurnstile(token, ip).catch(() => null);
  if (!turnstile?.success) redirect('/forgot-password?error=bot_check_failed');

  const limit = await checkPasswordRecoveryRequestRateLimit(email, ip).catch(() => null);
  if (!limit || limit.unavailable) redirect('/forgot-password?error=verification_unavailable');
  if (!limit.allowed) redirect('/forgot-password?error=rate_limited&retry=' + limit.retryAfter);

  const supabase = await createClient().catch(() => null);
  // SSR PKCE stores the verifier in the requesting browser; open the email there.
  const result = await supabase?.auth.resetPasswordForEmail(email, {
    redirectTo: origin + '/auth/callback?next=/reset-password',
  }).catch(() => null);

  if (result && !result.error) {
    // Auth acceptance is not evidence that a message arrived.
    await logAudit({
      action: 'auth.password_reset_requested',
      tenantId: null,
      userId: null,
      metadata: { email_hash: createHash('sha256').update(email).digest('hex').slice(0, 16) },
    });
  }
  // Never reflect provider messages or reveal whether an account exists.
  redirect('/forgot-password?success=email_sent');
}
