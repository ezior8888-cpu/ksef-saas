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

/**
 * Konwertuje Buffer na Postgres bytea literal (`\x<hex>`).
 * Niezbędne, bo supabase-js serializuje Buffer różnie zależnie od wersji.
 * Format `\x<hex>` jest natywnym literalem Postgresa i parsowany identycznie
 * przez `parseBytea` w `lib/supabase/admin-queries.ts`.
 */
export function bufferToByteaLiteral(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}
