'use client';

import Script from 'next/script';

/**
 * Widget Cloudflare Turnstile dla formularzy auth.
 *
 * Działa przez auto-render: ładujemy `api.js`, Cloudflare skanuje DOM
 * w poszukiwaniu `.cf-turnstile` i renderuje widget. Po sukcesie dodaje
 * hidden input `cf-turnstile-response` do parent form — Server Action
 * odbiera token przez `formData.get('cf-turnstile-response')`.
 *
 * Gdy `NEXT_PUBLIC_TURNSTILE_SITE_KEY` nieustawione (dev lokalny bez
 * konta Cloudflare) — komponent zwraca null. Server-side `isTurnstileConfigured`
 * sprawdza `TURNSTILE_SECRET_KEY` i też pomija weryfikację, więc dev flow
 * działa bez konfiguracji.
 */
export function TurnstileWidget({
  action,
}: {
  /** Etykieta akcji dla analyzy CF (oddzielne ratesze dla login vs register). */
  action?: 'login' | 'register' | 'forgot-password';
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey || siteKey.includes('xxx')) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile flex justify-center"
        data-sitekey={siteKey}
        data-theme="dark"
        data-action={action}
        data-size="flexible"
      />
    </>
  );
}
