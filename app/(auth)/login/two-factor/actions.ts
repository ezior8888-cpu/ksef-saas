'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { logAudit } from '@/lib/audit/log';
import { getClientIp } from '@/lib/auth/get-client-ip';
import { consumeRecoveryCode } from '@/lib/auth/mfa-recovery';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

/**
 * Verify 6-cyfrowego kodu TOTP albo recovery code dla zalogowanego usera
 * w stanie AAL1 (po signInWithPassword, przed 2FA challenge).
 *
 * Recovery code rozpoznajemy po formacie (długość != 6 albo zawiera myślnik).
 *
 * Rate limit: 5 / 5 min / userId — chroni przed brute-force TOTP (1M kombinacji).
 */
export async function verifyMfaChallengeAction(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '').trim();
  const next = safeRedirectPath(String(formData.get('redirect') ?? ''));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ip = await getClientIp();
  const rl = await checkRateLimit({
    bucket: 'two_factor_challenge',
    identifier: `${user.id}:${ip}`,
    limit: 5,
    windowSeconds: 5 * 60,
  });
  if (!rl.allowed) {
    redirect('/login/two-factor?error=rate_limited');
  }

  const isRecovery = code.length !== 6 || /-/.test(code) || /[a-z]/i.test(code);

  if (isRecovery) {
    const consumed = await consumeRecoveryCode(user.id, code);
    if (!consumed) {
      await logAudit({
        action: 'auth.mfa_challenge_failed',
        tenantId: null,
        userId: user.id,
        metadata: { method: 'recovery_code' },
      });
      redirect('/login/two-factor?error=invalid_code');
    }

    // Recovery code zaakceptowany → wymuszamy AAL2 przez ponowne wystawienie
    // sesji. Niestety Supabase nie pozwala "bypass" challenge dla recovery
    // codes na poziomie SDK — alternatywa to admin API. Dla MVP: po
    // recovery zostawiamy AAL1 i polegamy na audit log + powiadomienie
    // emailem (do dodania w Krok 27 monitoring? — TODO).
    //
    // Praktyczny efekt: middleware AAL check by zapętlił usera. Workaround:
    // ustaw sygnał w session metadata że ostatnio recovery — middleware
    // pomija enforcement dla tego logowania.
    //
    // Na razie zezwalamy na dalszy przelogowanie, ale loggujemy.
    await logAudit({
      action: 'auth.mfa_recovery_code_used',
      tenantId: null,
      userId: user.id,
    });

    // Po recovery code zalecamy regenerate codes na settings/security —
    // jeden się "spalił". Tymczasem dajemy dostęp do reszty apki.
    revalidatePath('/', 'layout');
    redirect(next);
  }

  // TOTP path: challenge + verify
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === 'verified');
  if (!totp) {
    redirect('/login/two-factor?error=no_factor');
  }

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
    factorId: totp.id,
  });
  if (chErr || !challenge) {
    await logAudit({
      action: 'auth.mfa_challenge_failed',
      tenantId: null,
      userId: user.id,
      metadata: { method: 'totp', stage: 'challenge' },
    });
    redirect('/login/two-factor?error=unknown');
  }

  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code,
  });
  if (vErr) {
    await logAudit({
      action: 'auth.mfa_challenge_failed',
      tenantId: null,
      userId: user.id,
      metadata: { method: 'totp', stage: 'verify' },
    });
    redirect('/login/two-factor?error=invalid_code');
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
