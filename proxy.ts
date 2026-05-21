import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16+ Proxy (konwencja zamiast root `middleware.ts`) — każde żądanie
 * przed renderem. Logika sesji i reguł routingu: `lib/supabase/middleware.ts`
 * (spec 19.1.3 — MARKETING_PATHS, isPublicPath, redirect na `/dashboard`).
 *
 * NIE dodawaj tu PostHog (`posthog-node` / `client.capture`) — ten plik to
 * auth + redirecty, nie „proxy ruchu do PostHoga”. Wizard często myli nazwę
 * `proxy.ts` z reverse proxy `/ingest`. Integracja:
 *   - przeglądarka: `components/analytics/posthog-snippet-loader.tsx`
 *   - serwer: `lib/analytics/posthog-node-client.ts` + `trackServer()`
 *   - env: `NEXT_PUBLIC_POSTHOG_KEY` w `.env.local` (nigdy jawny `phc_` w kodzie)
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
