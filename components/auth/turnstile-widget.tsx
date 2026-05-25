'use client';

import Script from 'next/script';

/**
 * Widget Cloudflare Turnstile dla formularzy auth.
 */
export function TurnstileWidget({
  action,
  theme = 'dark',
}: {
  action?: 'login' | 'register' | 'forgot-password';
  theme?: 'light' | 'dark';
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
        data-theme={theme}
        data-action={action}
        data-size="flexible"
      />
    </>
  );
}
