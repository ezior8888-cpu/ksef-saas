'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action: logowanie email+hasło.
 * Na błąd → redirect na /login z query `?error=...`.
 * Na sukces → redirect na /invoices.
 */
export async function loginWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=missing_fields');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect('/login?error=invalid_credentials');
  }

  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn) {
    const { data: row } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', signedIn.id)
      .maybeSingle();
    await logAudit({
      action: 'auth.login',
      tenantId: row?.tenant_id ?? null,
      userId: signedIn.id,
      metadata: { method: 'password' },
    });
  }

  revalidatePath('/', 'layout');
  redirect('/invoices');
}

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

  // Potwierdzenie email włączone w Supabase → session = null, trzeba kliknąć link z maila.
  // Potwierdzenie wyłączone → od razu jest sesja, użytkownik zalogowany.
  if (!data.session) {
    redirect('/login?success=check_email');
  }

  const uid = data.user?.id;
  if (uid) {
    const { data: row } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', uid)
      .maybeSingle();
    await logAudit({
      action: 'auth.signup',
      tenantId: row?.tenant_id ?? null,
      userId: uid,
      metadata: { flow: 'session_immediate' },
    });
  }

  revalidatePath('/', 'layout');
  redirect('/invoices');
}

/**
 * Server Action: inicjacja logowania przez Google.
 * Przekierowuje do Google → Google do /auth/callback.
 */
export async function loginWithGoogle(): Promise<void> {
  const headersList = await headers();
  const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth_failed');
  }

  redirect(data.url);
}

/**
 * Server Action: wylogowanie.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    await logAudit({
      action: 'auth.logout',
      tenantId: row?.tenant_id ?? null,
      userId: user.id,
    });
  }
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
