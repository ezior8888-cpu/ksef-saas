import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client do użycia w Client Components.
 * Przechowuje sesję w cookies dostępnych dla SDK w przeglądarce.
 * NIE używać w Server Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE is completed by /auth/callback. Never import a session from a
        // user-controlled URL, including before /auth/finish clears its hash.
        detectSessionInUrl: false,
      },
    }
  );
}
