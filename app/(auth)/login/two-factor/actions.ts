'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { logAudit } from '@/lib/audit/log';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';
import { checkMfaRateLimit } from '@/lib/rate-limit/mfa';
import { createClient } from '@/lib/supabase/server';

/** TOTP only: recovery must never consume a code without restoring access. */
export async function verifyMfaChallengeAction(formData: FormData): Promise<void> {
  const rawCode = formData.get('code');
  const code = typeof rawCode === 'string' && rawCode.length <= 64 ? rawCode.trim() : '';
  const next = safeRedirectPath(String(formData.get('redirect') ?? ''));
  function fail(error: string): never {
    redirect('/login/two-factor?' + new URLSearchParams({ error, redirect: next }));
  }

  const supabase = await createClient();
  const state = await getVerifiedMfaState(supabase).catch(() => null);
  if (!state) fail('verification_unavailable');
  if (state.status === 'unauthenticated') redirect('/login');
  if (state.status === 'verified') redirect(next);
  if (state.status !== 'challenge_required') fail('no_factor');
  const { user } = state;

  if (!/^[0-9]{6}$/.test(code)) {
    // No code lookup, consumption, factor reset, or successful audit event.
    fail(code && /[a-z-]/i.test(code) ? 'recovery_unavailable' : 'invalid_code');
  }

  const limit = await checkMfaRateLimit(user.id);
  if (limit.unavailable) fail('verification_unavailable');
  if (!limit.allowed) fail('rate_limited');

  // Factors come from authenticated Auth response, not session.user in cookies.
  const factor = user.factors?.find(
    (item) => item.factor_type === 'totp' && item.status === 'verified',
  );
  if (!factor) fail('no_factor');

  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id }).catch(() => null);
  if (!challenge || challenge.error || !challenge.data) fail('verification_unavailable');

  const verified = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  }).catch(() => null);
  if (!verified || verified.error) {
    await logAudit({
      action: 'auth.mfa_challenge_failed',
      tenantId: null,
      userId: user.id,
      metadata: { method: 'totp', stage: 'verify' },
    });
    fail('invalid_code');
  }

  // A successful SDK response alone must not claim that a stronger session exists.
  const finalState = await getVerifiedMfaState(supabase).catch(() => null);
  if (!finalState || finalState.status !== 'verified' || finalState.user.id !== user.id) {
    fail('verification_unavailable');
  }

  await logAudit({
    action: 'auth.mfa_challenge_succeeded',
    tenantId: null,
    userId: user.id,
    metadata: { method: 'totp' },
  });
  revalidatePath('/', 'layout');
  redirect(next);
}
