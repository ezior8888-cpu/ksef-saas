import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16+ Proxy (konwencja zamiast root `middleware.ts`) — każde żądanie
 * przed renderem. Logika sesji i reguł routingu: `lib/supabase/middleware.ts`
 * (spec 19.1.3 — MARKETING_PATHS, isPublicPath, redirect na `/dashboard`).
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
