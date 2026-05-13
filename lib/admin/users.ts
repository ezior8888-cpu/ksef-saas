/**
 * Admin user listing + detail queries (Faza 24).
 *
 * Wszystko leci przez `createAdminClient` (service_role, bypass RLS), bo:
 *   1. Admin musi widzieć cudzą zawartość (organizacje, faktury, notki).
 *   2. Te funkcje są wołane TYLKO z `/admin/*` server components, które są
 *      pre-guarded przez `requireAdmin()` w `app/admin/layout.tsx`.
 *
 * NIE używamy Redis cache — admin ogląda dane operacyjne, świeżość > 50ms.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface AdminUserListItem {
  userId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  emailConfirmed: boolean;
  /** Liczba aktywnych membership'ów (organizacji w których jest userem). */
  orgCount: number;
  /** Pierwsza/primary organizacja (najnowsza joined). */
  primaryOrgName: string | null;
  primaryOrgNip: string | null;
  primaryOrgVerified: boolean;
}

export interface AdminUserListOptions {
  /** Search po email LUB tenant.nip LUB tenant.name (case-insensitive). */
  q?: string;
  /** Filtr statusu konta. */
  status?: 'all' | 'active' | 'suspended' | 'unverified';
  /** Pagination — od 0. */
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * Lista userów na potrzeby `/admin/users`. Łączy `auth.admin.listUsers`
 * z `memberships` + `tenants` żeby pokazać kontekst organizacyjny obok email'a.
 *
 * UWAGA: search w `auth.admin.listUsers` nie ma natywnego query API.
 * Filtrujemy in-memory po `q`, co dla < 5k userów jest OK. Dla większych
 * skali będziemy potrzebować RPC po `auth.users` (Faza 28 — pre-launch).
 */
export async function listAdminUsers(
  options: AdminUserListOptions = {},
): Promise<{
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = createAdminClient();
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const q = options.q?.trim().toLowerCase() ?? '';
  const status = options.status ?? 'all';

  // Krok 1: pobierz wszystkich userów (paginacja Supabase: max 1000/page).
  // Dla MVP wystarczy — przy 5k+ zmieniamy na RPC z LIMIT/OFFSET.
  const { data: authData, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  }
  const allUsers = authData.users;

  // Krok 2: pobierz wszystkie membership + tenant snapshots jednym zapytaniem.
  const userIds = allUsers.map((u) => u.id);
  const { data: memberships } = await supabase
    .from('memberships')
    .select(
      'user_id, joined_at, organization_id, tenants(name, nip, ksef_verified_at)',
    )
    .in('user_id', userIds)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  // Krok 3: zbuduj indeks userId → membership[]
  type MembershipRow = {
    user_id: string;
    joined_at: string;
    organization_id: string;
    tenants:
      | {
          name: string;
          nip: string;
          ksef_verified_at: string | null;
        }
      | {
          name: string;
          nip: string;
          ksef_verified_at: string | null;
        }[]
      | null;
  };
  const membershipsByUser = new Map<string, MembershipRow[]>();
  for (const m of (memberships ?? []) as MembershipRow[]) {
    const arr = membershipsByUser.get(m.user_id) ?? [];
    arr.push(m);
    membershipsByUser.set(m.user_id, arr);
  }

  // Krok 4: zbuduj final rows
  const enriched: AdminUserListItem[] = allUsers.map((u) => {
    const userMemberships = membershipsByUser.get(u.id) ?? [];
    const primary = userMemberships[0]; // posortowane DESC by joined_at
    const primaryTenant = Array.isArray(primary?.tenants)
      ? primary.tenants[0]
      : primary?.tenants;
    return {
      userId: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      bannedUntil:
        (u as unknown as { banned_until?: string | null }).banned_until ?? null,
      emailConfirmed: Boolean(u.email_confirmed_at),
      orgCount: userMemberships.length,
      primaryOrgName: primaryTenant?.name ?? null,
      primaryOrgNip: primaryTenant?.nip ?? null,
      primaryOrgVerified: Boolean(primaryTenant?.ksef_verified_at),
    };
  });

  // Krok 5: filtrowanie po `q` i `status`.
  let filtered = enriched;
  if (q) {
    filtered = filtered.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.primaryOrgNip?.includes(q) ||
        u.primaryOrgName?.toLowerCase().includes(q),
    );
  }
  if (status === 'active') {
    filtered = filtered.filter((u) => !u.bannedUntil && u.emailConfirmed);
  } else if (status === 'suspended') {
    filtered = filtered.filter((u) => Boolean(u.bannedUntil));
  } else if (status === 'unverified') {
    filtered = filtered.filter((u) => !u.emailConfirmed);
  }

  // Krok 6: pagination.
  const total = filtered.length;
  const startIdx = page * pageSize;
  const items = filtered.slice(startIdx, startIdx + pageSize);

  return { items, total, page, pageSize };
}

// ─── User detail ────────────────────────────────────────────────────────

export interface AdminUserDetail {
  userId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  emailConfirmed: boolean;
  emailConfirmedAt: string | null;
  /** Membership w każdej organizacji. */
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationNip: string;
    role: string;
    status: string;
    joinedAt: string;
    ksefVerified: boolean;
    invoiceCount: number;
    expenseCount: number;
  }>;
  /** Audit log — ostatnie 50 akcji powiązanych z tym userId. */
  recentAuditLogs: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata: unknown;
    createdAt: string;
    tenantId: string | null;
  }>;
  /** Notki admin (nie-archived). */
  notes: Array<{
    id: string;
    body: string;
    authorEmail: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const supabase = createAdminClient();

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(
    userId,
  );
  if (userErr || !userData.user) {
    return null;
  }
  const u = userData.user;

  // Memberships + tenant info, sorted by joined_at DESC.
  const { data: memberships } = await supabase
    .from('memberships')
    .select(
      'organization_id, role, status, joined_at, tenants(name, nip, ksef_verified_at)',
    )
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  type MembershipRow = {
    organization_id: string;
    role: string;
    status: string;
    joined_at: string;
    tenants:
      | { name: string; nip: string; ksef_verified_at: string | null }
      | { name: string; nip: string; ksef_verified_at: string | null }[]
      | null;
  };

  const orgIds = (memberships ?? []).map((m) => m.organization_id);

  // Faktury + expenses counts per org — jeden batch query każdy.
  const [invCountsRes, expCountsRes] = await Promise.all([
    orgIds.length > 0
      ? supabase
          .from('invoices')
          .select('tenant_id', { count: 'exact' })
          .in('tenant_id', orgIds)
      : Promise.resolve({ data: [] as { tenant_id: string }[], count: null }),
    orgIds.length > 0
      ? supabase
          .from('expenses')
          .select('tenant_id', { count: 'exact' })
          .in('tenant_id', orgIds)
      : Promise.resolve({ data: [] as { tenant_id: string }[], count: null }),
  ]);

  // Zlicz per-tenant manualnie (count: 'exact' bez group_by w PostgREST).
  const invCounts = new Map<string, number>();
  for (const row of (invCountsRes.data ?? []) as { tenant_id: string }[]) {
    invCounts.set(row.tenant_id, (invCounts.get(row.tenant_id) ?? 0) + 1);
  }
  const expCounts = new Map<string, number>();
  for (const row of (expCountsRes.data ?? []) as { tenant_id: string }[]) {
    expCounts.set(row.tenant_id, (expCounts.get(row.tenant_id) ?? 0) + 1);
  }

  const enrichedMemberships = ((memberships ?? []) as MembershipRow[]).map((m) => {
    const tenant = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
    return {
      organizationId: m.organization_id,
      organizationName: tenant?.name ?? '—',
      organizationNip: tenant?.nip ?? '—',
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      ksefVerified: Boolean(tenant?.ksef_verified_at),
      invoiceCount: invCounts.get(m.organization_id) ?? 0,
      expenseCount: expCounts.get(m.organization_id) ?? 0,
    };
  });

  // Audit log — ostatnich 50 akcji gdzie user_id = userId.
  const { data: auditRows } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, metadata, created_at, tenant_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Notki admin (nie-archived).
  const { data: noteRows } = await supabase
    .from('admin_user_notes')
    .select('id, body, author_email, created_at, updated_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  return {
    userId: u.id,
    email: u.email ?? null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    bannedUntil:
      (u as unknown as { banned_until?: string | null }).banned_until ?? null,
    emailConfirmed: Boolean(u.email_confirmed_at),
    emailConfirmedAt: u.email_confirmed_at ?? null,
    memberships: enrichedMemberships,
    recentAuditLogs: (auditRows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
      createdAt: r.created_at,
      tenantId: r.tenant_id,
    })),
    notes: (noteRows ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      authorEmail: r.author_email,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}
