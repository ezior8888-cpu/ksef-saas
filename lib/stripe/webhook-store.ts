/**
 * Idempotency dla Stripe webhook'ów (Faza 25 Krok 3).
 *
 * Stripe gwarantuje at-least-once delivery — bez tej tabeli ten sam event
 * mógłby zostać wystawiony 2-3× (Stripe retry przy 5xx, manual replay z
 * dashboardu). Skutek: zduplikowane payment rows w DB, podwójny self-invoicing
 * przez KSeF (klient dostałby 2 faktury VAT za jedno opłacenie!).
 *
 * Strategia: `stripe_webhook_events.id = event.id` (Stripe `evt_*`). Najpierw
 * próbujemy INSERT — jeśli UNIQUE conflict, event był już przetworzony =>
 * webhook handler robi 200 OK natychmiast bez ponownego processing'u.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type WebhookProcessingStatus = 'processed' | 'failed' | 'skipped';

/**
 * Próbuje zarejestrować webhook event jako "in flight". Zwraca:
 *   - `true` gdy handler powinien przetworzyć (pierwszy raz albo retry po błędzie)
 *   - `false` gdy event został już POMYŚLNIE przetworzony (prawdziwy duplikat)
 *
 * KRYTYCZNE: event rejestrujemy jako `processing` (in-flight), a NIE `processed`.
 * Skip robimy WYŁĄCZNIE dla statusu terminalnego `processed`. Gdy poprzednia
 * próba padła (`failed`) albo utknęła (`processing` — crash przed finalize),
 * pozwalamy Stripe retry ponowić — inaczej pojedynczy transient błąd handlera
 * (blip DB, chwilowy KSeF) trwale gubiłby zdarzenie billingowe (Stripe dostawał
 * 200 „duplicate" i nie ponawiał). Handlery są idempotentne (upsert po
 * subscription id / pi_*), więc ponowne przetworzenie jest bezpieczne.
 */
export async function tryClaimWebhookEvent(
  eventId: string,
  type: string,
  payload: unknown,
): Promise<{ claimed: boolean }> {
  const supabase = createAdminClient();

  // 1) Próba INSERT jako `processing`. ON CONFLICT DO NOTHING (atomic).
  const { data: inserted, error } = await supabase
    .from('stripe_webhook_events')
    .upsert(
      {
        id: eventId,
        type,
        payload: payload as never,
        processing_status: 'processing',
        received_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');

  if (error) {
    throw new Error(`webhook idempotency upsert failed: ${error.message}`);
  }

  // INSERT się udał = pierwszy raz.
  if (Array.isArray(inserted) && inserted.length > 0) {
    return { claimed: true };
  }

  // 2) Konflikt — event już istnieje. Skip TYLKO gdy naprawdę przetworzony.
  const { data: existing, error: selErr } = await supabase
    .from('stripe_webhook_events')
    .select('processing_status')
    .eq('id', eventId)
    .maybeSingle();

  if (selErr) {
    throw new Error(`webhook idempotency read failed: ${selErr.message}`);
  }

  if (existing?.processing_status === 'processed') {
    return { claimed: false }; // prawdziwy duplikat udanego przetworzenia
  }

  // `failed` / `processing` (stale) — pozwól ponowić. Oznacz jako in-flight.
  await supabase
    .from('stripe_webhook_events')
    .update({ processing_status: 'processing', processing_error: null })
    .eq('id', eventId);

  return { claimed: true };
}

/**
 * Aktualizuje status finalny po przetworzeniu eventu. Wołane po sukcesie
 * lub po crashu (zapisujemy `failed` żeby było widać w `/admin/audit`).
 */
export async function finalizeWebhookEvent(
  eventId: string,
  status: WebhookProcessingStatus,
  errorMessage?: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('stripe_webhook_events')
    .update({
      processing_status: status,
      processing_error: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}
