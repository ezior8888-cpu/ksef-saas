import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SAFE_DEFAULT = '/dashboard';

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
 * Adres bazowy dla WSZYSTKICH przekierowań z tego handlera.
 *
 * `new URL(request.url).origin` w trybie standalone za proxy zwraca adres
 * nasłuchu kontenera (`https://0.0.0.0:3000`), a nie adres publiczny —
 * przeglądarka nie ma jak go otworzyć i użytkownik widzi błąd DNS.
 * Wcześniej dotyczyło to obu ścieżek błędu, więc nieudany reset hasła
 * kończył się na nieistniejącej stronie zamiast na ekranie logowania.
 *
 * Kolejność źródeł jest celowa: `NEXT_PUBLIC_APP_URL` jest wartością
 * konfiguracyjną, więc — inaczej niż nagłówek `x-forwarded-host` — nie da
 * się jej podmienić spreparowanym żądaniem.
 */
function resolveBase(request: Request, origin: string): string {
  if (process.env.NEXT_PUBLIC_APP_ENV === 'development') return origin;

  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${forwardedHost}`;
  }

  return origin;
}

/**
 * Callback dla OAuth (Google) i email confirmation.
 * Supabase przekierowuje tu z parametrem `code`. Wymieniamy kod na sesję.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));
  const base = resolveBase(request, origin);

  if (!code) {
    return NextResponse.redirect(
      `${base}/login?error=auth_callback_missing_code`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
  }

  return NextResponse.redirect(`${base}${next}`);
}
