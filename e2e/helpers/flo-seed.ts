import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { FloListItem, FloPreview } from '@/types/flo';

/**
 * Sianie propozycji agenta na potrzeby testów przeglądarkowych
 * (kroki 32–33 toru B).
 *
 * DLACZEGO WPROST DO BAZY, A NIE PRZEZ SILNIK: testy interfejsu mają
 * sprawdzać, co widzi i może kliknąć człowiek, a nie to, czy cron trafnie
 * wykrył sprawę. Trafność funkcji ma własne testy po stronie silnika.
 * Wchodząc wprost do tabeli, ustawiamy dokładnie ten stan, którego chcemy —
 * łącznie z takim, którego silnik nie wyprodukuje na żądanie (propozycja
 * z nieaktualnym odciskiem danych).
 */

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'E2E seed FLO: brak NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w env',
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface SeedProposalOptions {
  tenantId: string;
  kind: string;
  title: string;
  body: string;
  /** domyślnie za tydzień */
  expiresAt?: string;
  /** `{ label, href }[]` — „dlaczego to widzę” */
  evidence?: { label: string; href: string }[];
  payload?: {
    primaryLabel?: string;
    requiresPreview?: boolean;
    preview?: FloPreview;
    items?: FloListItem[];
    inputLabel?: string;
    inputKind?: 'email' | 'text' | 'amount';
    /** ISO — pasek cofnięcia; w bazie siedzi w `payload`, nie w kolumnie */
    undoableUntil?: string;
  };
  /**
   * Odcisk danych. Wpisanie tu wartości, której silnik nie policzy ponownie,
   * daje propozycję NIEAKTUALNĄ — czyli dokładnie ten przypadek, o który
   * chodzi w kroku 19: odmowa wykonania, która nie jest awarią.
   */
  fingerprint?: string;
}

const HOUR = 60 * 60 * 1000;

/** Wstawia jedną propozycję i zwraca jej identyfikator. */
export async function seedProposal(
  opts: SeedProposalOptions,
): Promise<string> {
  const now = Date.now();

  const { data, error } = await adminClient()
    .from('flo_proposals')
    .insert({
      tenant_id: opts.tenantId,
      kind: opts.kind,
      // Klucz tematu musi być unikalny w obrębie żywych propozycji —
      // inaczej drugi test podmieni kartę pierwszego zamiast dołożyć swoją.
      topic_key: `${opts.kind}:e2e:${now}:${Math.random().toString(36).slice(2, 8)}`,
      status: 'open',
      priority: 10,
      title: opts.title,
      body: opts.body,
      payload: opts.payload ?? {},
      evidence: opts.evidence ?? [],
      fingerprint: opts.fingerprint ?? 'e2e',
      expires_at: new Date(now + 7 * 24 * HOUR).toISOString(),
      ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
    })
    .select('id')
    .single();

  if (error) throw new Error(`E2E seed FLO: ${error.message}`);
  return (data as { id: string }).id;
}

/** Sprząta wszystkie propozycje organizacji — wołane po teście. */
export async function cleanupProposals(tenantId: string): Promise<void> {
  const db = adminClient();

  // Kolejność ma znaczenie: żetony zgody wskazują na propozycje.
  await db.from('flo_approvals').delete().eq('tenant_id', tenantId);
  await db.from('flo_proposals').delete().eq('tenant_id', tenantId);
}

/** Stan propozycji w bazie — do sprawdzenia skutku kliknięcia. */
export async function readProposalStatus(id: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('flo_proposals')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  return (data as { status: string } | null)?.status ?? null;
}
