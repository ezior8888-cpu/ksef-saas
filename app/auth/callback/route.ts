import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SAFE_DEFAULT = '/reports';

/**
 * Whitelistuje ścieżkę dla redirectu po wymianie kodu OAuth / email confirm.
 *
 * Odrzucamy:
 *  - wartości puste / nie-stringowe,
 *  - cokolwiek nie zaczynającego się od `/`,
 *  - protocol-relative `//evil.com`, `/\\evil.com` (URL parser interpretuje
 *    jako inny host),
 *  - schematy absolutne (`https://...`, `javascript:`, ...).
 *
 * Bez tego `next` z query stringa pozwalał na open redirect:
 *   /auth/callback?code=...&next=//phishing.pl → redirect na phishing.pl
 *   ze świeżą sesją zalogowaną w naszej domenie.
 */
function safeNextPath(rawNext: string | null): string {
  if (!rawNext) return SAFE_DEFAULT;
  if (!rawNext.startsWith('/')) return SAFE_DEFAULT;
  if (rawNext.startsWith('//') || rawNext.startsWith('/\\')) return SAFE_DEFAULT;
  if (rawNext.includes('://')) return SAFE_DEFAULT;
  return rawNext;
}

/**
 * Callback dla OAuth (Google) i email confirmation.
 * Supabase przekierowuje tu z parametrem `code`. Wymieniamy kod na sesję.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_missing_code`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // Produkcja/staging mogą stać za load balancerem — ufamy `x-forwarded-host`
  // tylko w trybie nielokalnym; w dev używamy origin z URL-a żądania.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === 'development';
  const base =
    isLocalEnv || !forwardedHost ? origin : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${next}`);
}
