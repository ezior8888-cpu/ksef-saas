import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Updater sesji Supabase.
 * Wywoływany przez proxy.ts w root projektu przy KAŻDYM żądaniu.
 *
 * Zadania:
 * 1. Odczytać cookies z żądania
 * 2. Odświeżyć wygasłe tokeny Supabase Auth
 * 3. Zapisać nowe cookies w odpowiedzi
 * 4. Przekierować niezalogowanych usera z chronionych stron
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // WAŻNE: getUser() pyta Auth API i zawsze zwraca poprawny stan sesji
  // niezależnie od konfiguracji JWT projektu (HS256 / RS256 / ES256).
  // NIE używaj getSession() - odczytuje cookie bez weryfikacji (można sfałszować).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Lista ścieżek publicznych (bez auth).
  // /api/inngest: webhook dla Inngest Cloud/Dev Server - Inngest SDK sam
  //   weryfikuje podpis przez INNGEST_SIGNING_KEY, więc Supabase auth
  //   musi się odsunąć, inaczej `inngest-cli dev` dostaje redirect na /login.
  // /api/sentry-test-log: zostało celowo USUNIĘTE z whitelisty po audycie —
  //   endpoint sam wymusza `SENTRY_LOG_TEST_SECRET` (fail-closed) i nie ma
  //   powodu, by ktoś bez sesji mógł go w ogóle wywoływać.
  const publicPaths = [
    '/login',
    '/register',
    '/forgot-password',
    '/auth',
    '/api/inngest',
    '/api/health',
    '/api/portal',
    '/accountant',
  ];
  const isPublicPath =
    publicPaths.some((p) => path.startsWith(p)) || path === '/';

  // Niezalogowany próbuje wejść na chronioną stronę → /login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Zalogowany próbuje wejść na /login → dashboard
  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/reports';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
