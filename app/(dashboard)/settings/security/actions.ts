'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/log';
import { validatePassword } from '@/lib/auth/password';
import { reauthenticateWithPassword } from '@/lib/auth/reauth';
import {
  deleteAllRecoveryCodes,
  generateAndStoreRecoveryCodes,
} from '@/lib/auth/mfa-recovery';
import { createClient } from '@/lib/supabase/server';

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; error: 'not_authenticated' | 'invalid_current' | 'weak_password' | 'password_breached' | 'update_failed' };

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

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
  error?: 'not_authenticated' | 'enroll_failed' | 'already_enrolled';
}

/**
 * Start enrollment TOTP factora. Zwraca QR + secret do pokazania w UI.
 * Factor jest w stanie `unverified` aż do `verifyTotpEnrollmentAction`.
 */
export async function enrollTotpAction(): Promise<EnrollTotpResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  // Sprzątamy stare unverified factory żeby user mógł retry bez "duplicate".
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const stale = factors?.all?.filter((f) => f.status === 'unverified') ?? [];
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const verified = factors?.totp?.find((f) => f.status === 'verified');
  if (verified) return { ok: false, error: 'already_enrolled' };

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `FaktFlow ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) return { ok: false, error: 'enroll_failed' };

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export type VerifyTotpEnrollmentResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: 'not_authenticated' | 'verify_failed' };

/**
 * Verify code z aplikacji TOTP po enrollu. Sukces → factor staje się
 * `verified`, generujemy 8 recovery codes (pokazywane RAZ).
 */
export async function verifyTotpEnrollmentAction(
  factorId: string,
  code: string,
): Promise<VerifyTotpEnrollmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (chErr || !challenge) return { ok: false, error: 'verify_failed' };

  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) return { ok: false, error: 'verify_failed' };

  const recoveryCodes = await generateAndStoreRecoveryCodes(user.id);

  await logAudit({
    action: 'auth.mfa_enrolled',
    tenantId: null,
    userId: user.id,
    metadata: { factor_id: factorId },
  });

  revalidatePath('/settings/security');
  return { ok: true, recoveryCodes };
}

export type UnenrollTotpResult =
  | { ok: true }
  | { ok: false; error: 'not_authenticated' | 'invalid_password' | 'unenroll_failed' };

/**
 * Usuwa wszystkie TOTP factory + wyczyść recovery codes. Wymaga re-auth
 * hasłem — wyłączenie 2FA to sensitive operation.
 */
export async function unenrollTotpAction(
  currentPassword: string,
): Promise<UnenrollTotpResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const reauth = await reauthenticateWithPassword(currentPassword);
  if (!reauth.ok) return { ok: false, error: 'invalid_password' };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const all = factors?.all ?? [];
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
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: 'not_authenticated' | 'invalid_password' | 'regenerate_failed' };

/**
 * Wymiana wszystkich recovery codes na nowe. Wymaga re-auth.
 * Stare są nieodwołalnie usunięte — user musi zapisać nowe.
 */
export async function regenerateRecoveryCodesAction(
  currentPassword: string,
): Promise<RegenerateRecoveryCodesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const reauth = await reauthenticateWithPassword(currentPassword);
  if (!reauth.ok) return { ok: false, error: 'invalid_password' };

  try {
    const recoveryCodes = await generateAndStoreRecoveryCodes(user.id);
    await logAudit({
      action: 'auth.mfa_recovery_codes_regenerated',
      tenantId: null,
      userId: user.id,
    });
    revalidatePath('/settings/security');
    return { ok: true, recoveryCodes };
  } catch (err) {
    console.error('[regenerateRecoveryCodesAction]', err);
    return { ok: false, error: 'regenerate_failed' };
  }
}
