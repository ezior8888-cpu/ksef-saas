import { createServerClient } from '@supabase/ssr';
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
 * Server client z service_role - OBCHODZI RLS!
 * Używaj WYŁĄCZNIE w Inngest jobs i admin endpointach.
 */
export async function createAdminClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Admin client nie zarządza sesją
        },
      },
    }
  );
}
