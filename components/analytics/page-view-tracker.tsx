'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics/client';

/**
 * Wysyła `$pageview` przy każdej zmianie trasy (Faza 31 Krok 3).
 *
 * `capture_pageview` w PostHog jest wyłączony — App Router nie emituje
 * natywnego page-change eventu, więc robimy to ręcznie. Łapiemy WSZYSTKIE
 * pageviews, łącznie z pierwszym (PostHog jest initowany eager w providerze,
 * więc przy pierwszym efekcie jest już gotowy).
 *
 * `useSearchParams` wymaga granicy Suspense — stąd wewnętrzny `Tracker`.
 */
function Tracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    const url = `${window.location.origin}${pathname}${qs ? `?${qs}` : ''}`;
    trackPageView(url);
  }, [pathname, searchParams]);

  return null;
}

export function PageViewTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
