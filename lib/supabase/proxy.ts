import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_HEADER, isUuid } from './active-org';

/**
 * Updater sesji Supabase.
 * Wywoływany przez middleware.ts w root projektu przy KAŻDYM żądaniu.
 *
 * Zadania:
 * 1. Odczytać cookies z żądania
 * 2. Odświeżyć wygasłe tokeny Supabase Auth
 * 3. Zapisać nowe cookies w odpowiedzi
 * 4. Przekierować niezalogowanych usera z chronionych stron
 * 5. Multi-org: jeśli zalogowany user nie ma ustawionego cookie
 *    `ksef.active_org`, ale ma jakieś aktywne membership — wybiera
 *    pierwsze (preferując `last_active_tenant_id`) i ustawia cookie.
 *    Brak membership na chronionych ścieżkach → redirect /onboarding.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const activeOrgCookie = request.cookies.get(ACTIVE_ORG_COOKIE)?.value;

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
      global: isUuid(activeOrgCookie)
        ? { headers: { [ACTIVE_ORG_HEADER]: activeOrgCookie } }
        : undefined,
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
    '/share-target',
    '/invite',
  ];
  const isPublicPath = publicPaths.some((p) => path.startsWith(p));

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
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Multi-org bootstrap: zalogowany na chronionej ścieżce bez aktywnej org.
  // - Brak cookie → wybierz preferowaną org (last_active_tenant_id lub
  //   pierwsze aktywne membership) i ustaw cookie.
  // - 0 aktywnych membership → /onboarding.
  // Pomijamy /onboarding (zaraz tam będziemy) i /api (Inngest, route handlers
  // same autoryzują się — Server Actions wywoływane z dashboardu już mają
  // cookie z poprzedniego request).
  const needsBootstrap =
    user &&
    !isPublicPath &&
    !path.startsWith('/onboarding') &&
    !path.startsWith('/api') &&
    !isUuid(activeOrgCookie);

  if (needsBootstrap && user) {
    const { data: candidates } = await supabase
      .from('memberships')
      .select('organization_id, joined_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(50);

    const memberships = candidates ?? [];

    if (memberships.length === 0) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from('users')
      .select('last_active_tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    const lastActive = profile?.last_active_tenant_id ?? null;
    const preferred = memberships.find(
      (m) => m.organization_id === lastActive,
    );
    const choice = preferred?.organization_id ?? memberships[0]!.organization_id;

    // Redirect do tej samej ścieżki z cookie ustawionym — następne żądanie
    // już będzie miało nagłówek `x-active-org` zaaplikowany do PostgREST.
    const url = request.nextUrl.clone();
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set({
      name: ACTIVE_ORG_COOKIE,
      value: choice,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return redirect;
  }

  return supabaseResponse;
}
