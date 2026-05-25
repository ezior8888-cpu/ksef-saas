import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16+ Proxy (konwencja zamiast root `middleware.ts`) — każde żądanie
 * przed renderem. Logika sesji i reguł routingu: `lib/supabase/middleware.ts`.
 *
 * ─── PostHog (wizard często myli ten plik) ───
 * NIE wklejaj tu `import { PostHog } from 'posthog-node'` ani `const client = new PostHog(...)`.
 * Ten plik jest bundlowany pod Edge — `posthog-node` zwykle nie działa i psuje build.
 *
 * Gdzie jest to, o co prosi wizard:
 *   • Token (Project API Key): `.env.local` → `NEXT_PUBLIC_POSTHOG_KEY` (nie `phc_` w kodzie)
 *   • `new PostHog(...)`: `lib/analytics/posthog-node-client.ts` → `getPostHogNodeClient()`
 *   • `await client.shutdown()`: `lib/analytics/posthog-process-shutdown.ts`
 *     (rejestracja SIGINT/SIGTERM z `instrumentation.ts` przy starcie Node)
 *   • Przeglądarka ($pageview): `instrumentation-client.ts` → `initPosthogBrowser()`
 *   • Reverse proxy eventów: `next.config.ts` → `/ingest`
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
