/**
 * Admin dashboard metrics — agregaty dla landing `/admin`.
 *
 * Wszystkie zapytania robią ZAWSZE z `createAdminClient` (service_role,
 * bypass RLS). Bezpieczeństwo: ta funkcja jest wołana TYLKO z server
 * components pod `/admin/*`, które są pre-guarded przez `requireAdmin()`
 * w `app/admin/layout.tsx`.
 *
 * Nie cache-ujemy w Redisie (mimo Fazy 22) — admin dashboard widzi 1-3 osoby
 * w sumie na całą organizację, cache miss/hit ratio nie ma znaczenia, a
 * świeże dane są ważniejsze niż 50ms latency.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getKsefHealthSnapshot, type KsefHealthSnapshot } from '@/lib/ksef/health-status';
import type { KsefEnvironment } from '@/types/ksef';

export interface AdminOverviewMetrics {
  totalUsers: number;
  totalTenants: number;
  activeTenants: number;
  /** Tenants flagged `deleted_at IS NOT NULL` (soft-deleted, retention period). */
  deletedTenants: number;
  /** Nowi userzy w ostatnich 24h. */
  signups24h: number;
  /** Nowi tenanci w ostatnich 7 dni. */
  newTenants7d: number;
  /** Faktury wystawione w ostatnich 24h (wszyscy tenanci). */
  invoicesIssued24h: number;
  /** Faktury z `ksef_status='accepted'` w ostatnich 24h. */
  invoicesAccepted24h: number;
  /** Faktury w `offline_queued` (czekają na recovery). */
  offlineQueued: number;
  /** Aktualny snapshot KSeF health (z Fazy 23). */
  ksefHealth: KsefHealthSnapshot | null;
  /** Pending requests dostępu do orgs (`organization_join_requests`). */
  pendingJoinRequests: number;
}

function currentKsefEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

export async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const supabase = createAdminClient();
  const env = currentKsefEnv();

  const day1Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const day7Iso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Wszystkie query naraz — admin nie czeka 8× sekwencyjnie.
  const [
    usersList,
    tenantsCountRes,
    activeTenantsRes,
    deletedTenantsRes,
    signups24hRes,
    newTenants7dRes,
    invoices24hRes,
    accepted24hRes,
    offlineQueuedRes,
    joinReqRes,
    ksefHealth,
  ] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1, page: 1 }),
    supabase.from('tenants').select('*', { count: 'exact', head: true }),
    supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .not('deleted_at', 'is', null),
    // auth.users nie ma RLS — listUsers wystarczy z paging do count'u,
    // ale to drogie. Lepiej: szukamy w `tenants.created_at` jako proxy
    // (każdy onboarding tworzy tenant). Real `auth.users.created_at`
    // wymaga `listUsers({ perPage: 1000 })` z manual filtr.
    supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', day1Iso),
    supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', day7Iso),
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'issued')
      .gte('created_at', day1Iso),
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'issued')
      .eq('ksef_status', 'accepted')
      .gte('created_at', day1Iso),
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('ksef_status', 'offline_queued'),
    supabase
      .from('organization_join_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    getKsefHealthSnapshot(env),
  ]);

  return {
    // listUsers zwraca `total` w response — patrz `users.length` lub
    // dedicated count. SDK Supabase eksponuje `data.users` + `data.total`
    // (od 2.40+).
    totalUsers:
      (usersList.data as unknown as { total?: number; users: unknown[] })?.total ??
      usersList.data?.users.length ??
      0,
    totalTenants: tenantsCountRes.count ?? 0,
    activeTenants: activeTenantsRes.count ?? 0,
    deletedTenants: deletedTenantsRes.count ?? 0,
    signups24h: signups24hRes.count ?? 0,
    newTenants7d: newTenants7dRes.count ?? 0,
    invoicesIssued24h: invoices24hRes.count ?? 0,
    invoicesAccepted24h: accepted24hRes.count ?? 0,
    offlineQueued: offlineQueuedRes.count ?? 0,
    pendingJoinRequests: joinReqRes.count ?? 0,
    ksefHealth,
  };
}
