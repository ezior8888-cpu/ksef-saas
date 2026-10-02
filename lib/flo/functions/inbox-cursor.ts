/**
 * Utrwalony stan pobierania skrzynki KSeF (tabela z 00063) — HWM (AUD-18).
 *
 * Skrzynka chodziła przesuwnym oknem „ostatnie 48 h”: awaria dłuższa niż
 * 48 h zostawiała faktury kosztowe, których nikt już nie pobrał, a klient
 * płacił wyższy podatek, nie mając jak się o tym dowiedzieć. Teraz zapisujemy,
 * do której chwili KSeF potwierdził komplet (`permanentStorageHwmDate`),
 * i od niej zaczyna się następne okno — po przerwie każdej długości.
 *
 * Kolumny z 00063, bez migracji: `window_to` = HWM (początek następnego
 * okna), `window_from` = początek ostatniego pełnego okna, `announced_count`
 * = pobrane w nim faktury, `saved_count` = nowo zapisane. `continuation_token`
 * nie jest używany — `/invoices/query/metadata` nie ma tokenu kontynuacji.
 */

import { createAdminClient } from '@/lib/supabase/admin';

interface CursorRow {
  window_to: string | null;
}

interface CursorClient {
  from: (table: 'ksef_inbox_cursor') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: CursorRow | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
}

/** HWM ostatniego pełnego przebiegu albo `null` (firma jeszcze nie pobierana). */
export async function readInboxHwm(
  tenantId: string,
  client: CursorClient = createAdminClient() as unknown as CursorClient,
): Promise<string | null> {
  const { data, error } = await client
    .from('ksef_inbox_cursor')
    .select('window_to')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.window_to ?? null;
}

/** Zapis PO zapisaniu faktur z okna — HWM nie może wyprzedzić bazy. */
export async function saveInboxHwm(
  tenantId: string,
  state: { windowFrom: string; hwm: string; fetched: number; saved: number },
  client: CursorClient = createAdminClient() as unknown as CursorClient,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('ksef_inbox_cursor').upsert(
    {
      tenant_id: tenantId,
      continuation_token: null,
      window_from: state.windowFrom,
      window_to: state.hwm,
      announced_count: state.fetched,
      saved_count: state.saved,
      last_page_at: now,
      updated_at: now,
    },
    { onConflict: 'tenant_id' },
  );

  if (error) throw new Error(error.message);
}
