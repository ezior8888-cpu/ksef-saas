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
 *   - `true` gdy to pierwszy raz (handler powinien przetworzyć)
 *   - `false` gdy event już był (handler skip'uje)
 *
 * UPSERT z ON CONFLICT DO NOTHING — atomic.
 */
export async function tryClaimWebhookEvent(
  eventId: string,
  type: string,
  payload: unknown,
): Promise<{ claimed: boolean }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .upsert(
      {
        id: eventId,
        type,
        payload: payload as never,
        processing_status: 'processed',
        received_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');

  if (error) {
    throw new Error(`webhook idempotency upsert failed: ${error.message}`);
  }

  // `ignoreDuplicates: true` + `.select()`: gdy konflikt nie ma INSERTu,
  // `data` jest pusta tablica. Gdy INSERT się udał, `data` zawiera nowy wiersz.
  const claimed = Array.isArray(data) && data.length > 0;
  return { claimed };
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
