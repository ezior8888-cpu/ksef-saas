'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
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

  if (!email || !password || password.length < 8) {
    redirect('/register?error=weak_password');
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
