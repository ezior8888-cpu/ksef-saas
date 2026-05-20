'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

/**
 * Identify zalogowanego użytkownika w PostHog (Faza 31 Krok 5).
 *
 * Renderowany w dashboard layout — w tym momencie user jest już zalogowany,
 * mamy jego id i tenantId. PostHog łączy wszystkie wcześniejsze anonimowe
 * zdarzenia z tej sesji z `distinctId = userId`.
 *
 * `group('tenant', tenantId)` — PostHog group analytics. Dzięki temu eventy
 * z poziomu tenanta (subscription_created, payment_succeeded — wysyłane
 * server-side z `distinctId = tenantId`) łączą się z eventami usera w
 * jednym widoku organizacji.
 *
 * UTM-y są łapane przez PostHog autocapture (`$initial_utm_*` person
 * properties) — nie musimy ich dodatkowo czytać z URL.
 */
export function AnalyticsIdentify({
  userId,
  email,
  tenantId,
}: {
  userId: string;
  email: string | null;
  tenantId: string;
}) {
  useEffect(() => {
    if (!posthog.__loaded) return;
    if (posthog.has_opted_out_capturing()) return;

    // Identify aktualizuje też person properties — bezpieczne wywołanie
    // przy każdej zmianie userId (np. po wylogowaniu + zalogowaniu kogoś innego).
    posthog.identify(userId, {
      email: email ?? undefined,
    });

    // Group analytics — łączy eventy server-side wysyłane per-tenant
    // z eventami klienckimi danego usera w widoku organizacji.
    posthog.group('tenant', tenantId);
  }, [userId, email, tenantId]);

  return null;
}
