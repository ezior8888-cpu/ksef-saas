/**
 * Admin /support dashboard queries (Faza 24 Krok 4).
 *
 * Day-to-day operations widgets:
 *   - Recent signups (24h) — sprawdzić czy nikt się nie zaciął na onboardingu
 *   - Inactive users (14d) — kandydaci do re-engagement campaign (po Fazie 26)
 *   - Recently failed invoices (24h) — błędy KSeF wymagające ręcznej interwencji
 *   - Pending join requests — czekają na zatwierdzenie ownerów
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ─── 1. Recent signups ─────────────────────────────────────────────

export interface RecentSignup {
  userId: string;
  email: string | null;
  createdAt: string;
  emailConfirmed: boolean;
  hasOrganization: boolean;
  primaryOrgName: string | null;
}

/**
 * Userzy zarejestrowani w ostatnich N godzinach. `auth.admin.listUsers`
 * sortuje DESC by created_at — bierzemy pierwsze 100 i filtrujemy po cutoff.
 */
export async function getRecentSignups(
  hours = 24,
  limit = 100,
): Promise<RecentSignup[]> {
  const supabase = createAdminClient();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  const { data: usersList, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: Math.min(limit, 200),
  });
  if (error) {
    throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  }

  const recent = usersList.users
    .filter((u) => new Date(u.created_at).getTime() >= cutoff)
    .slice(0, limit);

  if (recent.length === 0) return [];

  // Doczytaj membership pierwszej org (czy user faktycznie ukończył onboarding).
  const userIds = recent.map((u) => u.id);
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, joined_at, tenants(name)')
    .in('user_id', userIds)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  type MembershipRow = {
    user_id: string;
    joined_at: string;
    tenants: { name: string } | { name: string }[] | null;
  };
  const byUser = new Map<string, MembershipRow>();
  for (const m of (memberships ?? []) as MembershipRow[]) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, m);
  }

  return recent.map((u) => {
    const m = byUser.get(u.id);
    const tenant = m ? (Array.isArray(m.tenants) ? m.tenants[0] : m.tenants) : null;
    return {
      userId: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      emailConfirmed: Boolean(u.email_confirmed_at),
      hasOrganization: Boolean(m),
      primaryOrgName: tenant?.name ?? null,
    };
  });
}

// ─── 2. Inactive users ──────────────────────────────────────────────

export interface InactiveUser {
  userId: string;
  email: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  daysInactive: number;
}

/**
 * Userzy: aktywni (email confirmed + nie zawieszeni) ale bez logowania
 * przez >= N dni. Kandydaci do re-engagement campaign / churn analytics.
 *
 * Wymaga `auth.admin.listUsers` przeskanowania wszystkich userów — dla
 * MVP wystarczy, przy 5k+ trzeba RPC po `auth.users`.
 */
export async function getInactiveUsers(
  days = 14,
  limit = 100,
): Promise<InactiveUser[]> {
  const supabase = createAdminClient();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const { data: usersList, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  }

  const filtered = usersList.users
    .filter((u) => {
      // Skip nie-potwierdzeni email (nigdy się nie zalogowali = oczekiwane)
      if (!u.email_confirmed_at) return false;
      // Skip zawieszeni
      const banned = (u as unknown as { banned_until?: string | null }).banned_until;
      if (banned) return false;
      // Konto musi istnieć dłużej niż próg (świeży user nie jest "inactive")
      if (new Date(u.created_at).getTime() > cutoff) return false;
      // Brak last_sign_in_at LUB starszy niż cutoff
      const lastSignIn = u.last_sign_in_at
        ? new Date(u.last_sign_in_at).getTime()
        : 0;
      return lastSignIn < cutoff;
    })
    .map((u) => ({
      userId: u.id,
      email: u.email ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      createdAt: u.created_at,
      daysInactive: u.last_sign_in_at
        ? Math.floor((Date.now() - new Date(u.last_sign_in_at).getTime()) / (24 * 60 * 60 * 1000))
        : Math.floor((Date.now() - new Date(u.created_at).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((a, b) => b.daysInactive - a.daysInactive)
    .slice(0, limit);

  return filtered;
}

// ─── 3. Recently failed invoices ────────────────────────────────────

export interface FailedInvoice {
  invoiceId: string;
  tenantId: string;
  tenantName: string | null;
  tenantNip: string | null;
  internalNumber: string | null;
  ksefStatus: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
}

export async function getRecentlyFailedInvoices(
  hours = 24,
  limit = 50,
): Promise<FailedInvoice[]> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, internal_number, ksef_status, last_error, last_attempt_at, created_at, tenants(name, nip)',
    )
    .in('ksef_status', ['failed', 'rejected'])
    .or(`last_attempt_at.gte.${cutoffIso},created_at.gte.${cutoffIso}`)
    .order('last_attempt_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`invoices failed lookup: ${error.message}`);
  }

  type Row = {
    id: string;
    tenant_id: string;
    internal_number: string | null;
    ksef_status: string | null;
    last_error: string | null;
    last_attempt_at: string | null;
    created_at: string;
    tenants: { name: string; nip: string } | { name: string; nip: string }[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      invoiceId: row.id,
      tenantId: row.tenant_id,
      tenantName: t?.name ?? null,
      tenantNip: t?.nip ?? null,
      internalNumber: row.internal_number,
      ksefStatus: row.ksef_status,
      lastError: row.last_error,
      lastAttemptAt: row.last_attempt_at,
      createdAt: row.created_at,
    };
  });
}

// ─── 4. Pending join requests ───────────────────────────────────────

export interface PendingJoinRequest {
  id: string;
  requesterUserId: string;
  organizationId: string;
  organizationName: string | null;
  organizationNip: string | null;
  message: string | null;
  createdAt: string;
}

export async function getPendingJoinRequests(
  limit = 50,
): Promise<PendingJoinRequest[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('organization_join_requests')
    .select('id, requester_user_id, organization_id, message, created_at, tenants(name, nip)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`join_requests lookup: ${error.message}`);
  }

  type Row = {
    id: string;
    requester_user_id: string;
    organization_id: string;
    message: string | null;
    created_at: string;
    tenants: { name: string; nip: string } | { name: string; nip: string }[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      id: row.id,
      requesterUserId: row.requester_user_id,
      organizationId: row.organization_id,
      organizationName: t?.name ?? null,
      organizationNip: t?.nip ?? null,
      message: row.message,
      createdAt: row.created_at,
    };
  });
}
