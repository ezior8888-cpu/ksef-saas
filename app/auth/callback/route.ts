import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Callback dla OAuth (Google) i email confirmation.
 * Supabase przekierowuje tu z parametrem `code`.
 * Wymieniamy kod na sesję użytkownika.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reports';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Produkcja/staging mogą być za load balancerem
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Błąd lub brak kodu → przekierowanie na login z errorem
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
