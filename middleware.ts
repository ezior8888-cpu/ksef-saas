import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next.js Middleware — wywoływany przy KAŻDYM żądaniu przed renderowaniem.
 *
 * Zadania:
 * 1. Odświeżanie sesji Supabase (wymiana tokenów, zapis cookies).
 * 2. Przekierowanie niezalogowanych z chronionych tras → /login.
 * 3. Przekierowanie zalogowanych z /login → /reports.
 *
 * UWAGA: Next.js wymaga domyślnego eksportu `middleware` (nie dowolnej nazwy).
 * Plik musi nazywać się `middleware.ts` (lub `.js`) w root projektu.
 * Wcześniej projekt eksportował funkcję `proxy` z `proxy.ts` — Next.js ją ignorował,
 * więc ochrona sesji i redirect na /login nie działały wcale.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static images and assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
