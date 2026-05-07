/**
 * Centralny helper autoryzacji dla Server Actions / Server Components.
 *
 * Multi-org model:
 *   - User może mieć membership w wielu organizacjach.
 *   - Aktywna organizacja siedzi w cookie `ksef.active_org`, walidowana po
 *     stronie aplikacji (memberships) i RLS (`get_current_tenant_id()` w 00037
 *     zwraca tylko jeśli zalogowany user jest aktywnym członkiem).
 *
 * Funkcje:
 *   - `requireUserAndActiveOrg()` — zwraca kontekst dla zwykłej akcji
 *     (każdy aktywny członek). Zachowujemy też alias `requireUserAndTenant`
 *     dla istniejących wywołań.
 *   - `requireOrgRole(role)` — wymaga konkretnej roli w aktywnej org.
 *   - `requireOwner()` — alias dla `requireOrgRole('owner')`.
 *
 * Konwencja błędów: rzucamy `ActionAuthError`, akcja w `try/catch`
 * mapuje na `{ success: false, error: e.message }` dla zgodności
 * z istniejącym kontraktem zwrotnym.
 */

import { cookies } from 'next/headers';

import { createClient } from './server';
import { ACTIVE_ORG_COOKIE, isUuid } from './active-org';

export class ActionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionAuthError';
  }
}

export type UserRole = 'owner' | 'admin' | 'member' | 'accountant';

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string | null };
  /**
   * UUID aktywnej organizacji.
   * Nazwa pola pozostaje `tenantId` aby uniknąć ogromnego diffa po wszystkich
   * Server Actions — semantyka to `organization_id`.
   */
  tenantId: string;
  role: UserRole;
}

/**
 * Wymaga zalogowanego usera + ważnej aktywnej organizacji
 * (cookie + aktywne membership). Rzuca `ActionAuthError` w razie problemu.
 */
export async function requireUserAndActiveOrg(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ActionAuthError('Niezalogowany');

  const cookieStore = await cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (!isUuid(activeOrg)) {
    throw new ActionAuthError('Brak aktywnej organizacji');
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('role, status')
    .eq('user_id', user.id)
    .eq('organization_id', activeOrg)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) {
    throw new ActionAuthError('Brak dostępu do aktywnej organizacji');
  }

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    tenantId: activeOrg,
    role: (membership.role ?? 'member') as UserRole,
  };
}

/** Alias zachowany dla zgodności z istniejącymi wywołaniami w kodzie. */
export const requireUserAndTenant = requireUserAndActiveOrg;

/**
 * Wymaga konkretnej roli w aktywnej organizacji.
 * Lista akceptowanych ról jako argument — np. `requireOrgRole(['owner','admin'])`.
 */
export async function requireOrgRole(
  roles: UserRole | UserRole[],
): Promise<AuthContext> {
  const ctx = await requireUserAndActiveOrg();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(ctx.role)) {
    throw new ActionAuthError(
      allowed.length === 1 && allowed[0] === 'owner'
        ? 'Tylko właściciel'
        : 'Niewystarczające uprawnienia',
    );
  }
  return ctx;
}

/**
 * Wymaga zalogowanego owner-a aktywnej organizacji.
 */
export async function requireOwner(): Promise<AuthContext> {
  return requireOrgRole('owner');
}

/**
 * Bezpieczny wrapper na akcje serwerowe — łapie `ActionAuthError`
 * i mapuje na typowy `{ success: false, error }`.
 */
export async function withActionAuth<T>(
  fn: () => Promise<{ success: true } & T>,
): Promise<({ success: true } & T) | { success: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionAuthError) {
      return { success: false, error: e.message };
    }
    throw e;
  }
}
