'use server';

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
 * Sposób działania: `signInWithPassword({ email: <bieżący>, password })`.
 * Na sukcesie Supabase wystawia nową sesję (przedłuża), ale to OK — user
 * świadomie potwierdza tożsamość.
 *
 * Nie używamy `auth.reauthenticate()` (wysyła OTP na email), bo:
 *   - dodatkowy email per sensitive op to złe UX,
 *   - email-based reauth jest słabszy niż hasło + 2FA (Krok 6),
 *   - korzystamy z istniejącego password rate-limitera (Krok 2).
 */
export async function reauthenticateWithPassword(
  password: string,
): Promise<ReauthResult> {
  if (!password || typeof password !== 'string') {
    return { ok: false, error: 'invalid_password' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, error: 'not_authenticated' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) {
    return { ok: false, error: 'invalid_password' };
  }

  return { ok: true };
}
