/**
 * Utrwalony kursor pobierania skrzynki KSeF (krok 19-21 planu, tabela z 00063).
 *
 * Pobieranie chodzi po stronach przez `continuationToken`. Gdy proces zginie
 * w połowie — restart kontenera, timeout, 5xx z Ministerstwa — bez utrwalonego
 * kursora następny przebieg zaczyna od zera. To wygląda niewinnie, dopóki
 * okno dat się nie przesunie: wtedy część faktur kosztowych NIGDY nie trafia
 * do klienta, a on płaci wyższy podatek i nie ma jak się dowiedzieć, że
 * powinien czegoś szukać.
 */

import type { InboxCursorState } from '@/lib/flo/functions/expense-inbox';
import { cursorMatchesWindow } from '@/lib/flo/functions/expense-inbox';
import { createAdminClient } from '@/lib/supabase/admin';

interface CursorRow {
  tenant_id: string;
  continuation_token: string | null;
  window_from: string | null;
  window_to: string | null;
  announced_count: number;
  saved_count: number;
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
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

const EMPTY: InboxCursorState = {
  continuationToken: null,
  windowFrom: null,
  windowTo: null,
  announcedCount: 0,
  savedCount: 0,
};

/**
 * Kursor dla tego okna dat — albo pusty, jeśli zapisany dotyczy innego.
 *
 * Świadomie zwracamy pusty stan zamiast rzucać: kursor z innego okna nie jest
 * awarią, tylko informacją, że trzeba zacząć od początku.
 */
export async function readInboxCursor(
  tenantId: string,
  windowFrom: Date,
  windowTo: Date,
  client: CursorClient = createAdminClient() as unknown as CursorClient,
): Promise<InboxCursorState> {
  const { data, error } = await client
    .from('ksef_inbox_cursor')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return EMPTY;

  const state: InboxCursorState = {
    continuationToken: data.continuation_token,
    windowFrom: data.window_from,
    windowTo: data.window_to,
    announcedCount: data.announced_count ?? 0,
    savedCount: data.saved_count ?? 0,
  };

  return cursorMatchesWindow(state, windowFrom, windowTo) ? state : EMPTY;
}

export async function saveInboxCursor(
  tenantId: string,
  state: {
    continuationToken: string | null;
    windowFrom: Date;
    windowTo: Date;
    announcedCount: number;
    savedCount: number;
  },
  client: CursorClient = createAdminClient() as unknown as CursorClient,
): Promise<void> {
  const { error } = await client.from('ksef_inbox_cursor').upsert(
    {
      tenant_id: tenantId,
      continuation_token: state.continuationToken,
      window_from: state.windowFrom.toISOString(),
      window_to: state.windowTo.toISOString(),
      announced_count: state.announcedCount,
      saved_count: state.savedCount,
      last_page_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );

  if (error) throw new Error(error.message);
}

/** Pobieranie doszło do końca — kursor nie jest już do niczego potrzebny. */
export async function clearInboxCursor(
  tenantId: string,
  client: CursorClient = createAdminClient() as unknown as CursorClient,
): Promise<void> {
  const { error } = await client
    .from('ksef_inbox_cursor')
    .delete()
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);
}
