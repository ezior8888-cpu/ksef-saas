import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, isUuid } from '@/lib/supabase/active-org';
import type { UserRole } from '@/lib/supabase/auth-context';

/** Kształt listy przekazywanej do `OrgSwitcher`. */
export interface DashboardOrgMembershipPreview {
  organizationId: string;
  name: string;
  nip: string;
  role: UserRole;
  isActive: boolean;
}

type MembershipTenantRow = {
  organization_id: string;
  role: string;
  tenants:
    | {
        name: string;
        nip: string;
        ksef_verified_at: string | null;
      }
    | Array<{
        name: string;
        nip: string;
        ksef_verified_at: string | null;
      }>
    | null;
};

/**
 * Jedno wywołanie `getUser()` na request RSC (deduplikacja z layoutem / listą org).
 */
export const getDashboardSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

async function fetchMembershipRowsWithTenantsFromAdmin(
  userId: string,
): Promise<MembershipTenantRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('memberships')
    .select(
      'organization_id, role, status, tenants:organization_id(name, nip, ksef_verified_at)',
    )
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  return (data ?? []) as MembershipTenantRow[];
}

/**
 * Jedno zapytanie memberships+tenants na request (layout + baner + `listMyOrganizations`).
 */
export const getCachedMembershipRowsWithTenants = cache(
  async (userId: string): Promise<MembershipTenantRow[]> =>
    fetchMembershipRowsWithTenantsFromAdmin(userId),
);

export function mapMembershipRowsToOrgSwitcher(
  rows: MembershipTenantRow[],
  activeOrg: string | null,
): DashboardOrgMembershipPreview[] {
  return rows.map((row) => {
    const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      organizationId: row.organization_id,
      name: t?.name ?? '(bez nazwy)',
      nip: t?.nip ?? '',
      role: row.role as UserRole,
      isActive: activeOrg !== null && row.organization_id === activeOrg,
    };
  });
}

function tenantFromActiveRow(
  row: MembershipTenantRow | undefined,
): { name: string; nip: string; ksef_verified_at: string | null } | null {
  if (!row) return null;
  const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  if (!t) return null;
  return {
    name: t.name,
    nip: t.nip,
    ksef_verified_at: t.ksef_verified_at ?? null,
  };
}

/**
 * Weryfikacja dostępu do segmentu `(dashboard)` — jedna ścieżka przed renderem stron.
 * Używa zcache’owanych odczytów; `getCachedMembershipRowsWithTenants` nie powtórzy zapytania
 * w tym samym requeście dla nagłówka / banera / `listMyOrganizations`.
 */
export async function assertDashboardShellAccess(): Promise<void> {
  const [user, cookieStore] = await Promise.all([
    getDashboardSessionUser(),
    cookies(),
  ]);
  if (!user) redirect('/login');

  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!isUuid(activeOrg)) {
    redirect('/onboarding');
  }

  const rows = await getCachedMembershipRowsWithTenants(user.id);
  const activeRow = rows.find((r) => r.organization_id === activeOrg);
  const tenant = tenantFromActiveRow(activeRow);
  if (!tenant) {
    redirect('/onboarding');
  }
}

/**
 * Dane do `OrgSwitcher` — wywołanie po `assertDashboardShellAccess()`; zero dodatkowych
 * zapytań do bazy dzięki `getCachedMembershipRowsWithTenants`.
 */
export async function getDashboardOrgSwitcherProps(): Promise<{
  memberships: DashboardOrgMembershipPreview[];
  activeOrgId: string;
  activeName: string;
  activeNip: string;
}> {
  const [user, cookieStore] = await Promise.all([
    getDashboardSessionUser(),
    cookies(),
  ]);
  if (!user) redirect('/login');

  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!isUuid(activeOrg)) {
    redirect('/onboarding');
  }

  const rows = await getCachedMembershipRowsWithTenants(user.id);
  const activeRow = rows.find((r) => r.organization_id === activeOrg);
  const tenant = tenantFromActiveRow(activeRow);
  if (!tenant) {
    redirect('/onboarding');
  }

  return {
    memberships: mapMembershipRowsToOrgSwitcher(rows, activeOrg),
    activeOrgId: activeOrg,
    activeName: tenant.name,
    activeNip: tenant.nip,
  };
}

/**
 * Czy aktywna organizacja ma zweryfikowany KSeF (do banera w layoucie).
 */
export async function getDashboardActiveOrgVerified(): Promise<boolean> {
  const [user, cookieStore] = await Promise.all([
    getDashboardSessionUser(),
    cookies(),
  ]);
  if (!user) return true;

  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!isUuid(activeOrg)) return true;

  const rows = await getCachedMembershipRowsWithTenants(user.id);
  const activeRow = rows.find((r) => r.organization_id === activeOrg);
  const tenant = tenantFromActiveRow(activeRow);
  if (!tenant) return true;

  return tenant.ksef_verified_at !== null;
}
