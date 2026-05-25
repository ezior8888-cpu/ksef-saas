import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isProductionDeploy } from '@/lib/security/turnstile';

/**
 * Bootstrap sesji dla k6 (Faza 34).
 * Tylko LOAD_TEST_MODE=true i nie produkcja — ustawia cookies Supabase SSR
 * tak jak prawdziwe logowanie, bez Turnstile i bez Server Action.
 */
function isLoadTestSessionRouteEnabled(): boolean {
  if (isProductionDeploy()) return false;
  return process.env.LOAD_TEST_MODE === 'true';
}

export async function POST(request: Request) {
  if (!isLoadTestSessionRouteEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials' },
      { status: 401 },
    );
  }

  return response;
}
