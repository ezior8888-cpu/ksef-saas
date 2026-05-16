/**
 * Sentry user/tenant context helpers (Faza 27).
 *
 * Bez tego stack trace w Sentry pokazuje "user anonymous" — niemożliwe szybko
 * sprawdzić "czyja faktura padła". Z tagami:
 *   - `tags.userId` — który auth.users.id
 *   - `tags.tenantId` — który tenant
 *   - `user.email` — email do szybkiego lookup'u w admin panelu
 *
 * Sentry SDK ma global scope per request — `setSentryUserContext()` wołane
 * raz w server action / route handler propaguje się do wszystkich captures
 * w tym requeście.
 */

import * as Sentry from '@sentry/nextjs';

export interface SentryUserContext {
  userId: string;
  email?: string | null;
  tenantId?: string | null;
}

export function setSentryUserContext(ctx: SentryUserContext): void {
  Sentry.setUser({
    id: ctx.userId,
    email: ctx.email ?? undefined,
  });

  // tags.tenantId — łatwy filter w Sentry dashboard ("pokaż mi wszystkie
  // errory tenanta X").
  if (ctx.tenantId) {
    Sentry.setTag('tenantId', ctx.tenantId);
  }
}

/**
 * Wyczyść kontekst — wołaj na końcu request handlera w środowiskach które
 * reużywają instancje Node.js (np. Inngest worker, gdzie ten sam process
 * obsługuje wiele jobs sequentially).
 */
export function clearSentryUserContext(): void {
  Sentry.setUser(null);
  Sentry.setTag('tenantId', undefined as unknown as string);
}

/**
 * Helper do server actions — automatycznie ustawia kontekst na podstawie
 * `getPageContext()` (auth + tenant). Wywoływane w try/catch:
 *
 *   await withSentryContext(ctx, async () => {
 *     // server action body
 *   });
 */
export async function withSentryContext<T>(
  ctx: SentryUserContext,
  fn: () => Promise<T>,
): Promise<T> {
  setSentryUserContext(ctx);
  try {
    return await fn();
  } finally {
    clearSentryUserContext();
  }
}
