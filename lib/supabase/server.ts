import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client do użycia na serwerze:
 * - Server Components
 * - Server Actions
 * - Route Handlers
 *
 * Obsługuje cookies przez next/headers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Wywołane z Server Component - ignoruj.
            // Proxy przejmie odpowiedzialność za zapis.
          }
        },
      },
    }
  );
}

/**
 * Server client z service_role - OBCHODZI RLS.
 * Używaj WYŁĄCZNIE w Inngest jobs i Server Actions, które świadomie
 * chcą ominąć RLS (po uprzedniej weryfikacji auth.getUser()).
 *
 * DLACZEGO nie `@supabase/ssr` z cookies:
 * `createServerClient` z `@supabase/ssr` dokleja Bearer token z cookie
 * użytkownika, który w Supabase ma PIERWSZEŃSTWO przed apiKey. W efekcie
 * service_role jest "nadpisywany" rolą `authenticated` i RLS znów łapie
 * operacje. Dlatego używamy czystego `supabase-js` z wyłączonym persist
 * session - to prawdziwy admin bez kontekstu usera.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
