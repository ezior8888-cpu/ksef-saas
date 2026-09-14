'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export interface ReauthResult {
  ok: boolean;
  /** Tłumaczalny kod błędu — UI mapuje na komunikat. */
  error?: 'not_authenticated' | 'invalid_password' | 'unknown';
}

/**
 * Re-autentykacja hasłem przed wrażliwą operacją (zmiana hasła, włączenie
 * 2FA, usunięcie konta).
 *
 * Hasło sprawdzamy na osobnym kliencie bez cookies i trwałego storage.
 * Logowanie hasłem tworzy sesję AAL1; użycie klienta przeglądarkowej sesji
 * obniżałoby wcześniej potwierdzone MFA. Tymczasowa sesja musi należeć do
 * tego samego użytkownika i jest od razu wylogowywana wyłącznie lokalnie.
 * Ten helper potwierdza hasło, a nie drugi czynnik — MFA sprawdza wywołujący.
 */
export async function reauthenticateWithPassword(
  password: string,
): Promise<ReauthResult> {
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'invalid_password' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false, error: 'not_authenticated' };
  }

  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data, error } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });

  // Nawet niespójna odpowiedź tożsamości nie może zostawić celowo otwartej
  // sesji. Używamy JWT wyłącznie z odpowiedzi tego logowania i zakresu local.
  // Zwykłe auth.signOut() ukrywa błędy HTTP 401/403/404. Jego warstwa admin
  // zachowuje te błędy; nazwa SDK nie oznacza użycia klucza service_role.
  let cleanupFailed = false;
  const temporaryToken = data.session?.access_token;
  if (typeof temporaryToken === 'string' && temporaryToken) {
    try {
      const { error: cleanupError } = await verifier.auth.admin.signOut(temporaryToken, 'local');
      cleanupFailed = Boolean(cleanupError);
    } catch {
      cleanupFailed = true;
    }
  }

  if (error) {
    return { ok: false, error: 'invalid_password' };
  }

  if (cleanupFailed || typeof temporaryToken !== 'string' || !temporaryToken || data.user?.id !== user.id) {
    return { ok: false, error: 'unknown' };
  }

  return { ok: true };
}
