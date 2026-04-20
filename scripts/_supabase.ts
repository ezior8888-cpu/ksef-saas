/**
 * Supabase admin client dla skryptów CLI (tsx).
 *
 * Różni się od `lib/supabase/server.ts`:
 *   - używa `@supabase/supabase-js` (nie `@supabase/ssr`)
 *   - nie dotyka `next/headers::cookies()` (Node.js context, brak requestu)
 *   - service_role key - BYPASS RLS (używaj tylko w zaufanych skryptach dev/ops)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createScriptAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL nie jest ustawione');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY nie jest ustawione');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { bufferToByteaLiteral } from '../lib/supabase/bytea';
