'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { getClientIp } from '@/lib/auth/get-client-ip';
import { validatePassword } from '@/lib/auth/password';
import { checkRegisterRateLimit } from '@/lib/rate-limit/auth';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { inngest, userRegistered } from '@/lib/inngest/client';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action: rejestracja email+hasło.
 * Supabase wyśle email z linkiem potwierdzającym (jeśli włączone).
 */
export async function signupWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '');

  if (!email || !password) {
    redirect('/register?error=missing_fields');
  }

  const ip = await getClientIp();

  // Bot protection — pierwsza linia obrony przed spam signup.
  const turnstile = await verifyTurnstile(
    formData.get('cf-turnstile-response') as string | null,
    ip,
  );
  if (!turnstile.success) {
    redirect('/register?error=bot_check_failed');
  }

  // Anti-spam signup — per-IP.
  const rl = await checkRegisterRateLimit(ip);
  if (!rl.allowed) {
    redirect(`/register?error=rate_limited&retry=${rl.retryAfter}`);
  }

  // Strength + HIBP breach check. Wykonujemy PO rate-limit żeby nie palić
  // budżetu HIBP na bot spam.
  const pw = await validatePassword(password);
  if (!pw.valid) {
    redirect(
      `/register?error=${pw.reason === 'breached' ? 'password_breached' : 'weak_password'}`,
    );
  }

  const headersList = await headers();
  const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }

  const authUser = data.user;
  if (authUser?.id && authUser.email) {
    const firstName =
      name.trim().split(/\s+/)[0] || email.split('@')[0] || 'użytkowniku';
    try {
      await inngest.send(
        userRegistered.create({
          userId: authUser.id,
          email: authUser.email,
          firstName,
        }),
      );
    } catch (e) {
      console.error('[inngest] user/registered send failed', e);
    }

    await trackServer({
      distinctId: authUser.id,
      event: ANALYTICS_EVENTS.signupCompleted,
      properties: { method: 'password' },
      setPersonProperties: {
        email: authUser.email,
        first_name: firstName,
        plan: 'trial',
      },
    });
  }

  // Potwierdzenie email włączone w Supabase → session = null, trzeba kliknąć link z maila.
  // Potwierdzenie wyłączone → od razu jest sesja, użytkownik zalogowany.
  if (!data.session) {
    redirect('/login?success=check_email');
  }

  const uid = data.user?.id;
  if (uid) {
    await logAudit({
      action: 'auth.signup',
      tenantId: null,
      userId: uid,
      metadata: { flow: 'session_immediate' },
    });
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
