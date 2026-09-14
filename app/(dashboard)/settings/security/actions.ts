'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/log';
import { validatePassword } from '@/lib/auth/password';
import { reauthenticateWithPassword } from '@/lib/auth/reauth';
import { deleteAllRecoveryCodes } from '@/lib/auth/mfa-recovery';
import { checkMfaRateLimit } from '@/lib/rate-limit/mfa';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; error: 'not_authenticated' | 'invalid_current' | 'weak_password' | 'password_breached' | 'update_failed' | 'mfa_required' | 'verification_unavailable' };

/**
 * Zmiana hasła w panelu /settings/security.
 *
 * Wymaga re-auth (podanie aktualnego hasła) — zgodne z masterplanem Fazy 28
 * "re-auth na sensitive operations".
 */
export async function changePasswordAction(
  formData: FormData,
): Promise<PasswordChangeResult> {
  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');

  const supabase = await createClient();
  const state = await getVerifiedMfaState(supabase).catch(() => null);
  if (!state) return { ok: false, error: 'verification_unavailable' };
  if (state.status === 'unauthenticated') return { ok: false, error: 'not_authenticated' };
  if (state.status === 'challenge_required') return { ok: false, error: 'mfa_required' };
  const { user } = state;

  const reauth = await reauthenticateWithPassword(currentPassword);
  if (!reauth.ok) return { ok: false, error: 'invalid_current' };

  const pw = await validatePassword(newPassword);
  if (!pw.valid) {
    return {
      ok: false,
      error: pw.reason === 'breached' ? 'password_breached' : 'weak_password',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: 'update_failed' };

  await logAudit({
    action: 'auth.password_changed',
    tenantId: null,
    userId: user.id,
  });

  revalidatePath('/settings/security');
  return { ok: true };
}

export interface EnrollTotpResult {
  ok: boolean;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  error?: 'not_authenticated' | 'enroll_failed' | 'already_enrolled' | 'mfa_required' | 'rate_limited' | 'verification_unavailable';
}

/**
 * Start enrollment TOTP factora. Zwraca QR + secret do pokazania w UI.
 * Factor jest w stanie `unverified` aż do `verifyTotpEnrollmentAction`.
 */
export async function enrollTotpAction(): Promise<EnrollTotpResult> {
  const supabase = await createClient();
  const state = await getVerifiedMfaState(supabase).catch(() => null);
  if (!state) return { ok: false, error: 'verification_unavailable' };
  if (state.status === 'unauthenticated') return { ok: false, error: 'not_authenticated' };
  if (state.status === 'challenge_required') return { ok: false, error: 'mfa_required' };
  if (state.status === 'verified') return { ok: false, error: 'already_enrolled' };

  const limit = await checkMfaRateLimit(state.user.id);
  if (limit.unavailable) return { ok: false, error: 'verification_unavailable' };
  if (!limit.allowed) return { ok: false, error: 'rate_limited' };

  // Auth supplied these factors for this user; stop at any failed cleanup.
  const stale = state.user.factors?.filter(
    (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
  ) ?? [];
  for (const factor of stale) {
    const result = await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => null);
    if (!result || result.error) return { ok: false, error: 'enroll_failed' };
  }

  const result = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `FaktFlow ${new Date().toISOString().slice(0, 10)}`,
  }).catch(() => null);
  if (!result || result.error || !result.data) return { ok: false, error: 'enroll_failed' };
  return {
    ok: true,
    factorId: result.data.id,
    qrCode: result.data.totp.qr_code,
    secret: result.data.totp.secret,
  };
}

export type VerifyTotpEnrollmentResult =
  | { ok: true }
  | { ok: false; error: 'not_authenticated' | 'verify_failed' | 'mfa_required' | 'rate_limited' | 'verification_unavailable' };

/** Verify this user's pending TOTP factor and confirm the issued AAL2 session. */
export async function verifyTotpEnrollmentAction(
  factorId: string,
  code: string,
): Promise<VerifyTotpEnrollmentResult> {
  const supabase = await createClient();
  const state = await getVerifiedMfaState(supabase).catch(() => null);
  if (!state) return { ok: false, error: 'verification_unavailable' };
  if (state.status === 'unauthenticated') return { ok: false, error: 'not_authenticated' };
  if (state.status === 'challenge_required') return { ok: false, error: 'mfa_required' };
  if (state.status !== 'enrollment_required' || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
    return { ok: false, error: 'verify_failed' };
  }
  const { user } = state;
  const factor = user.factors?.find(
    (item) => item.id === factorId && item.factor_type === 'totp' && item.status === 'unverified',
  );
  if (!factor) return { ok: false, error: 'verify_failed' };

  const limit = await checkMfaRateLimit(user.id);
  if (limit.unavailable) return { ok: false, error: 'verification_unavailable' };
  if (!limit.allowed) return { ok: false, error: 'rate_limited' };

  const challenge = await supabase.auth.mfa.challenge({ factorId }).catch(() => null);
  if (!challenge || challenge.error || !challenge.data) return { ok: false, error: 'verify_failed' };
  const verified = await supabase.auth.mfa.verify({
    factorId, challengeId: challenge.data.id, code,
  }).catch(() => null);
  if (!verified || verified.error) return { ok: false, error: 'verify_failed' };

  const finalState = await getVerifiedMfaState(supabase).catch(() => null);
  if (!finalState || finalState.status !== 'verified' || finalState.user.id !== user.id ||
      !finalState.user.factors?.some((item) => item.id === factorId && item.status === 'verified' && item.factor_type === 'totp')) {
    return { ok: false, error: 'verification_unavailable' };
  }

  await logAudit({
    action: 'auth.mfa_enrolled', tenantId: null, userId: user.id,
    metadata: { factor_id: factorId },
  });
  revalidatePath('/settings/security');
  revalidatePath('/login/two-factor/setup');
  return { ok: true };
}

export type UnenrollTotpResult =
  | { ok: true }
  | { ok: false; error: 'not_authenticated' | 'invalid_password' | 'mfa_required' | 'unenroll_failed' };

/**
 * Usuwa wszystkie TOTP factory + wyczyść recovery codes. Wymaga re-auth
 * hasłem — wyłączenie 2FA to sensitive operation.
 */
export async function unenrollTotpAction(
  currentPassword: string,
): Promise<UnenrollTotpResult> {
  const supabase = await createClient();
  // Check the original MFA session before verifying the password.
  const state = await getVerifiedMfaState(supabase).catch(() => null);
  if (state?.status === 'unauthenticated') return { ok: false, error: 'not_authenticated' };
  if (!state || state.status !== 'verified') return { ok: false, error: 'mfa_required' };
  const { user } = state;

  const reauth = await reauthenticateWithPassword(currentPassword);
  if (!reauth.ok) return { ok: false, error: 'invalid_password' };

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factors) return { ok: false, error: 'unenroll_failed' };
  const all = factors.all;
  for (const f of all) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, error: 'unenroll_failed' };
  }

  await deleteAllRecoveryCodes(user.id);

  await logAudit({
    action: 'auth.mfa_unenrolled',
    tenantId: null,
    userId: user.id,
  });

  revalidatePath('/settings/security');
  return { ok: true };
}

export type RegenerateRecoveryCodesResult =
  | { ok: false; error: 'not_authenticated' | 'mfa_required' | 'recovery_unavailable' };

/** Keep old clients fail-closed until a complete recovery flow is implemented. */
export async function regenerateRecoveryCodesAction(
  currentPassword: string,
): Promise<RegenerateRecoveryCodesResult> {
  void currentPassword; // Legacy action argument; disabled recovery never verifies or stores it.
  const state = await getVerifiedMfaState(await createClient()).catch(() => null);
  if (state?.status === 'unauthenticated') return { ok: false, error: 'not_authenticated' };
  if (!state || state.status !== 'verified') return { ok: false, error: 'mfa_required' };
  return { ok: false, error: 'recovery_unavailable' };
}
