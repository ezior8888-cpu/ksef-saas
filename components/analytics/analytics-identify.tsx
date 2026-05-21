'use client';

import { useEffect } from 'react';

import { getBrowserPosthog, isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';

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
    const ph = getBrowserPosthog();
    if (!ph || !isBrowserPosthogReady()) return;
    if (ph.has_opted_out_capturing()) return;

    ph.identify(userId, {
      email: email ?? undefined,
    });

    ph.group('tenant', tenantId);
  }, [userId, email, tenantId]);

  return null;
}
