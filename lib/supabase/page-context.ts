/**
 * Helpery dla Server Components stron — zwracają kontekst auth + aktywna org
 * i robią `redirect()` zamiast rzucać wyjątek (jak Server Actions).
 *
 * Zachowujemy `tenantId` jako nazwę pola dla ciągłości z istniejącym kodem;
 * semantycznie to jest `organization_id` (multi-org).
 */

import { redirect } from 'next/navigation';

import { ACTIVE_ORG_COOKIE, getActiveOrgIdFromCookies } from './active-org';
import { createClient } from './server';
import type { UserRole } from './auth-context';

export interface PageContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  tenantId: string;
  role: UserRole;
}

/**
 * Standardowy kontekst dla strony w `(dashboard)`:
 * - niezalogowany → /login
 * - zalogowany bez aktywnej org → /onboarding
 * - zalogowany z cookie wskazującym org bez membership → /onboarding
 */
export async function getPageContext(): Promise<PageContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeOrg = await getActiveOrgIdFromCookies();
  if (!activeOrg) redirect('/onboarding');

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', activeOrg)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) redirect('/onboarding');

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    tenantId: activeOrg,
    role: (membership.role ?? 'member') as UserRole,
  };
}

/**
 * Wariant z wymogiem konkretnej roli — przy braku robi redirect na fallback.
 */
export async function getPageContextWithRole(
  roles: UserRole | UserRole[],
  fallback: string = '/settings',
): Promise<PageContext> {
  const ctx = await getPageContext();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(ctx.role)) {
    redirect(fallback);
  }
  return ctx;
}

// Re-export dla zgodności z importami (`COOKIE` używane lokalnie w kilku plikach).
export { ACTIVE_ORG_COOKIE };
