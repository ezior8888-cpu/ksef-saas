'use server';

import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
import { getClientIp } from '@/lib/auth/get-client-ip';
import { checkPasswordResetRateLimit } from '@/lib/rate-limit/auth';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action: żądanie resetu hasła. Anti-enumeration — zawsze
 * pokazujemy ten sam success message niezależnie czy email istnieje
 * w bazie. Bez tego atakujący mógłby wyciągać listę kont po komunikatach.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email || !email.includes('@')) {
    redirect('/forgot-password?error=invalid_email');
  }

  const ip = await getClientIp();

  const turnstile = await verifyTurnstile(
    formData.get('cf-turnstile-response') as string | null,
    ip,
  );
  if (!turnstile.success) {
    redirect('/forgot-password?error=bot_check_failed');
  }

  const rl = await checkPasswordResetRateLimit(email);
  if (!rl.allowed) {
    redirect(`/forgot-password?error=rate_limited&retry=${rl.retryAfter}`);
  }

  const headersList = await headers();
  const origin =
    headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/settings/security`,
  });

  if (error) {
    // Loguj, ale nie ujawniaj userowi — anti-enumeration.
    console.error('[forgot-password] resetPasswordForEmail:', error.message);
  }

  await logAudit({
    action: 'auth.password_reset_requested',
    tenantId: null,
    userId: null,
    metadata: { email_hash: hashEmail(email) },
  });

  redirect('/forgot-password?success=email_sent');
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}
