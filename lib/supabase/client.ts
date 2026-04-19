import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client do użycia w Client Components.
 * Przechowuje sesję w cookies (HTTP-only). NIE używać w Server Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
