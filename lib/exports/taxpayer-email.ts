/**
 * E-mail podatnika do JPK_V7M (Podmiot1/…/Email — pole wymagane).
 *
 * Tabela `tenants` nie ma własnego adresu, więc bierzemy adres aktywnego
 * właściciela firmy. Błąd odczytu rzuca — to nie „brak e-maila”.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function readTaxpayerEmail(client: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from('memberships')
    .select('user_id')
    .eq('organization_id', tenantId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Nie można odczytać właściciela firmy: ${error.message}`);
  const userId = (data as { user_id?: unknown } | null)?.user_id;
  if (typeof userId !== 'string') return null;

  const { data: user, error: userError } = await client.auth.admin.getUserById(userId);
  if (userError) throw new Error(`Nie można odczytać e-maila właściciela: ${userError.message}`);
  const email = user.user?.email?.trim();
  return email ? email : null;
}
