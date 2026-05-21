import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_HEADER, isUuid } from './active-org';

/**
 * Ścieżki marketingowe — dostęp bez logowania (spec 19.1.3).
 * Dopasowanie: dokładnie `p` albo prefiks `p/`.
 */
export const MARKETING_PATHS = [
  '/',
  '/pricing',
  '/blog',
  '/vs',
  '/kalkulator-oszczednosci',
  '/kontakt',
  '/legal',
  '/pomoc',
] as const;

const AUTH_PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/auth',
  '/onboarding',
  '/invite',
  '/accountant',
  '/share-target',
  '/gdpr',
] as const;

const PUBLIC_API_PREFIXES = [
  '/api/inngest',
  '/api/health',
  '/api/status',
  '/api/portal',
  '/api/email',
  // Dev-only diagnostyka (route sam zwraca 404 na production)
  '/api/dev',
] as const;

const STATIC_PUBLIC_EXACT = [
  '/manifest.webmanifest',
  '/sw.js',
  '/monitoring', // Sentry `tunnelRoute`
] as const;

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Trasy dostępne bez sesji (marketing + auth + wybrane API + statyczne).
 * Całość `/api/*` NIE jest publiczna — tylko jawne prefiksy (bezpieczeństwo).
 */
export function isPublicPath(pathname: string): boolean {
  // PostHog reverse proxy — musi być publiczny (skrypt ładuje się przed logowaniem).
  if (pathname.startsWith('/ingest')) return true;
  if (isMarketingPath(pathname)) return true;
  if (STATIC_PUBLIC_EXACT.some((p) => pathname === p)) return true;
  if (pathname.startsWith('/api/')) {
    return PUBLIC_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return AUTH_PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const APP_HOME = '/dashboard';

/**
 * Proxy / „middleware” — odświeżenie sesji Supabase + reguły routingu.
 *
 * Reguły:
 *  0. Zalogowany na `/` (landing) → `APP_HOME` (pulpit aplikacji).
 *  1. Niezalogowany na trasie spoza `isPublicPath` → `/login?redirect=…`.
 *  2. Zalogowany na /login lub /register → `APP_HOME`.
 *  3. Bootstrap `ksef.active_org` na chronionych trasach (bez /onboarding, bez /api).
 *  4. /onboarding — bez redirectu z proxy (soft-nav loop); strona sama decyduje.
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      global: isUuid(activeOrgCookie)
        ? { headers: { [ACTIVE_ORG_HEADER]: activeOrgCookie } }
        : undefined,
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api');

  if (user && path === '/') {
    const url = request.nextUrl.clone();
    url.pathname = APP_HOME;
    url.search = '';
    const res = NextResponse.redirect(url);
    for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
    return res;
  }

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    const res = NextResponse.redirect(url);
    for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
    return res;
  }

  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = APP_HOME;
    url.search = '';
    const res = NextResponse.redirect(url);
    for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
    return res;
  }

  // 2FA enforcement (Faza 28 Krok 6). User zalogowany ale jego sesja jest
  // AAL1 podczas gdy ma verified TOTP factor → musi przejść challenge.
  // Pozwalamy tylko na /login/two-factor i /auth/* (callback OAuth, signOut).
  if (
    user &&
    !path.startsWith('/login/two-factor') &&
    !path.startsWith('/auth/') &&
    !isApi &&
    !isPublicPath(path)
  ) {
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aalData?.currentLevel === 'aal1' &&
      aalData?.nextLevel === 'aal2'
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/login/two-factor';
      url.searchParams.set('redirect', path);
      const res = NextResponse.redirect(url);
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
      return res;
    }
  }

  const needsBootstrap =
    !!user && !isPublicPath(path) && !isApi && !isUuid(activeOrgCookie);

  if (needsBootstrap) {
    const { data: candidates } = await supabase
      .from('memberships')
      .select('organization_id, joined_at')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(50);

    const memberships = candidates ?? [];

    if (memberships.length === 0) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      const res = NextResponse.redirect(url);
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
      return res;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('last_active_tenant_id')
      .eq('id', user!.id)
      .maybeSingle();

    const lastActive = profile?.last_active_tenant_id ?? null;
    const preferred = memberships.find((m) => m.organization_id === lastActive);
    const choice = preferred?.organization_id ?? memberships[0]!.organization_id;

    const targetUrl = request.nextUrl.clone();
    const res = NextResponse.redirect(targetUrl);
    for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
    res.cookies.set({
      name: ACTIVE_ORG_COOKIE,
      value: choice,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return supabaseResponse;
}
