'use client';

import Script from 'next/script';

/**
 * Widget Cloudflare Turnstile dla formularzy auth.
 */
export function TurnstileWidget({
  action,
  theme = 'light',
}: {
  action?: 'login' | 'register' | 'forgot-password';
  theme?: 'light' | 'dark';
}) {
  // Lokalnie nie renderujemy widżetu: na localhost Cloudflare często nie
  // potrafi dokończyć weryfikacji i formularz zostaje bez tokenu, przez co
  // nie da się zalogować. Dwa warunki naraz, żeby nie mogło to zadziałać
  // na produkcji: build produkcyjny ma `NODE_ENV=production`, a wdrożenie
  // dodatkowo oznaczone jest markerem środowiska.
  const lokalnie =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_APP_ENV !== 'production';
  if (lokalnie) return null;

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
        data-theme={theme}
        data-action={action}
        data-size="flexible"
      />
    </>
  );
}
