'use client';

import { useSyncExternalStore } from 'react';

import {
  ANALYTICS_CONSENT_EVENT,
  CONSENT_KEY,
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
  type ConsentState,
} from '@/lib/analytics/consent';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === null) onChange();
  };
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const LABELS: Record<ConsentState, string> = {
  granted: 'Analityka jest włączona — wyraziłeś zgodę.',
  denied: 'Analityka jest wyłączona — nie wyraziłeś zgody albo ją wycofałeś.',
  unset: 'Nie podjąłeś jeszcze decyzji — analityka jest wyłączona.',
};

/**
 * Wycofanie zgody musi być tak samo łatwe jak jej udzielenie (art. 7 ust. 3
 * RODO). Do 15.10.2026 baner znikał po pierwszym kliknięciu i decyzji nie
 * dało się zmienić bez czyszczenia danych przeglądarki.
 */
export function CookieSettings() {
  const state = useSyncExternalStore<ConsentState | 'server'>(
    subscribe,
    () => getAnalyticsConsent(),
    () => 'server',
  );

  if (!isAnalyticsConfigured()) {
    return (
      <p className="text-sm">
        W tej wersji serwisu analityka jest wyłączona — nie zapisujemy niczego poza cookies niezbędnymi.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" aria-live="polite">
        {state === 'server' ? 'Sprawdzam ustawienia…' : LABELS[state]}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAnalyticsConsent(true)}
          disabled={state === 'granted'}
          className="rounded-xl bg-[var(--z-black,#111)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Włącz analitykę
        </button>
        <button
          type="button"
          onClick={() => setAnalyticsConsent(false)}
          disabled={state === 'denied'}
          className="rounded-xl border border-[var(--z-300,#d4d4d4)] px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Wyłącz analitykę (tylko niezbędne)
        </button>
      </div>
    </div>
  );
}
