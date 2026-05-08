'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action: logowanie email+hasło.
 * Na błąd → redirect na /login z query `?error=...`.
 * Na sukces → redirect na /dashboard (pulpit aplikacji).
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
      .select('last_active_tenant_id')
      .eq('id', signedIn.id)
      .maybeSingle();
    await logAudit({
      action: 'auth.login',
      tenantId: row?.last_active_tenant_id ?? null,
      userId: signedIn.id,
      metadata: { method: 'password' },
    });
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
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
      .select('last_active_tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    await logAudit({
      action: 'auth.logout',
      tenantId: row?.last_active_tenant_id ?? null,
      userId: user.id,
    });
  }
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
