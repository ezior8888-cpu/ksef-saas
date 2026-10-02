/**
 * Admin /system dashboard queries (Faza 24 Krok 3).
 *
 * - KSeF health timeline 24h z `ksef_health_log` (Faza 24 migracja 00044)
 * - Inngest jobs agregacja z `inngest_run_log` (success/error ratio, p95 duration)
 * - DB stats — `pg_total_relation_size` przez SECURITY DEFINER RPC
 */

import 'server-only';

import { requireAdmin } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { KsefEnvironment } from '@/types/ksef';

// Osobno, pod importami typów: wydanie 25.09 dokłada 'server-only' i
// requireAdmin tuż nad klientem — rozdzielenie oszczędza konfliktu.
import { OFFLINE_QUEUE_OPEN_STATUSES } from '@/lib/ksef/offline-queue-status';

// ─── 1. KSeF health 24h ────────────────────────────────────────────────

export interface HealthLogEntry {
  recordedAt: string;
  level: 'operational' | 'degraded' | 'down';
  responseTimeMs: number | null;
  consecutiveFailures: number;
  isMfOutage: boolean;
  error: string | null;
}

export async function getKsefHealthHistory(
  env: KsefEnvironment,
  hours = 24,
): Promise<HealthLogEntry[]> {
  await requireAdmin();
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('ksef_health_log')
    .select('recorded_at, level, response_time_ms, consecutive_failures, is_mf_outage, error_short')
    .eq('env', env)
    .gte('recorded_at', cutoffIso)
    .order('recorded_at', { ascending: true })
    .limit(1000); // 24h * 288 max = ~1000 z dużym zapasem

  if (error) {
    throw new Error(`ksef_health_log lookup failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    recordedAt: row.recorded_at,
    // DB CHECK constraint gwarantuje że jeden z 3, ale TS o tym nie wie.
    level: row.level as HealthLogEntry['level'],
    responseTimeMs: row.response_time_ms,
    consecutiveFailures: row.consecutive_failures,
    isMfOutage: row.is_mf_outage,
    error: row.error_short,
  }));
}

// ─── 2. Inngest jobs (last 24h) ────────────────────────────────────────

export interface InngestJobStat {
  eventName: string;
  totalRuns: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number | null;
  lastRunAt: string;
}

export async function getInngestJobStats(
  hours = 24,
): Promise<InngestJobStat[]> {
  await requireAdmin();
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('inngest_run_log')
    .select('event_name, status, duration_ms, created_at')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(10_000);

  if (error) {
    throw new Error(`inngest_run_log query failed: ${error.message}`);
  }

  // Agregacja in-memory (PostgREST nie ma natywnego GROUP BY).
  const byEvent = new Map<string, {
    total: number;
    success: number;
    error: number;
    durationSum: number;
    durationCount: number;
    lastRunAt: string;
  }>();

  for (const row of data ?? []) {
    const key = row.event_name;
    const bucket =
      byEvent.get(key) ??
      {
        total: 0,
        success: 0,
        error: 0,
        durationSum: 0,
        durationCount: 0,
        lastRunAt: row.created_at,
      };
    bucket.total++;
    // CHECK w 00003 dopuszcza tylko 'started' | 'succeeded' | 'failed';
    // 'succeeded' zapisuje worker pg-boss (`lib/jobs/run-log.ts`).
    if (row.status === 'succeeded' || row.status === 'success' || row.status === 'completed') {
      bucket.success++;
    } else if (row.status === 'error' || row.status === 'failed') {
      bucket.error++;
    }
    if (row.duration_ms !== null && row.duration_ms !== undefined) {
      bucket.durationSum += row.duration_ms;
      bucket.durationCount++;
    }
    if (row.created_at > bucket.lastRunAt) {
      bucket.lastRunAt = row.created_at;
    }
    byEvent.set(key, bucket);
  }

  return Array.from(byEvent.entries())
    .map(([eventName, b]) => ({
      eventName,
      totalRuns: b.total,
      successCount: b.success,
      errorCount: b.error,
      avgDurationMs: b.durationCount > 0 ? Math.round(b.durationSum / b.durationCount) : null,
      lastRunAt: b.lastRunAt,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns);
}

// ─── 3. DB stats ──────────────────────────────────────────────────────

export interface TableSize {
  tableName: string;
  totalBytes: number;
  rowEstimate: number;
}

export interface DbStats {
  totalDatabaseBytes: number;
  tables: TableSize[];
}

export async function getDbStats(): Promise<DbStats> {
  await requireAdmin();
  const supabase = createAdminClient();

  // Cast: RPC nie ma typed gen dopóki nie regenerujemy types/database.ts
  // po wgraniu migracji 00044. Cast na unknown jest celowy, fail-soft.
  const rpc = supabase.rpc as unknown as (fn: string) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;

  const [sizeRes, tablesRes] = await Promise.all([
    rpc('admin_database_size'),
    rpc('admin_table_sizes'),
  ]);

  if (sizeRes.error || tablesRes.error) {
    // Fallback gdy migracja jeszcze nie wgrana — zwracamy puste, dashboard
    // pokaże "RPC nie dostępny — wymaga migracji 00044".
    return { totalDatabaseBytes: 0, tables: [] };
  }

  const totalBytes = typeof sizeRes.data === 'number'
    ? sizeRes.data
    : typeof sizeRes.data === 'string'
      ? Number.parseInt(sizeRes.data, 10)
      : 0;

  const tablesRaw = Array.isArray(tablesRes.data)
    ? (tablesRes.data as Array<{
        table_name: string;
        total_bytes: number | string;
        row_estimate: number | string;
      }>)
    : [];

  return {
    totalDatabaseBytes: totalBytes,
    tables: tablesRaw.map((t) => ({
      tableName: t.table_name,
      totalBytes: typeof t.total_bytes === 'number' ? t.total_bytes : Number.parseInt(t.total_bytes, 10),
      rowEstimate: typeof t.row_estimate === 'number' ? t.row_estimate : Number.parseInt(t.row_estimate, 10),
    })),
  };
}

// ─── 4. Offline queue snapshot ────────────────────────────────────────

export interface OfflineQueueSnapshot {
  /** Queued rows for the configured KSeF environment. */
  pending: number;
  failed: number;
  oldestDeadline: string | null;
  blockedByEnvironment: number;
  nearestBlockedDeadline: string | null;
}

export async function getOfflineQueueSnapshot(): Promise<OfflineQueueSnapshot> {
  await requireAdmin();
  const environment = requireConfiguredKsefEnvironment();
  const blockedFilter = 'ksef_environment.is.null,ksef_environment.neq.' + environment;
  const supabase = createAdminClient();
  const [pendingRes, failedRes, oldestRes, blockedRes, blockedDeadlineRes] = await Promise.all([
    supabase.from('ksef_offline_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES])
      .eq('ksef_environment', environment),
    supabase.from('ksef_offline_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed').eq('ksef_environment', environment),
    supabase.from('ksef_offline_queue')
      .select('deadline')
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES])
      .eq('ksef_environment', environment)
      .order('deadline', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('ksef_offline_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES]).or(blockedFilter),
    supabase.from('ksef_offline_queue')
      .select('deadline')
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES]).or(blockedFilter)
      .order('deadline', { ascending: true }).limit(1).maybeSingle(),
  ]);
  // Failed queries are not an empty queue. Keep unknown provenance visible to
  // the operator rather than mixing another KSeF environment into the count.
  if (pendingRes.error || failedRes.error || oldestRes.error ||
      blockedRes.error || blockedDeadlineRes.error ||
      typeof pendingRes.count !== 'number' ||
      typeof failedRes.count !== 'number' ||
      typeof blockedRes.count !== 'number') {
    throw pendingRes.error ?? failedRes.error ?? oldestRes.error ??
      blockedRes.error ?? blockedDeadlineRes.error ??
      new Error('Offline24 queue snapshot unavailable');
  }
  if (pendingRes.count > 0 && !oldestRes.data?.deadline) {
    throw new Error('Open Offline24 deadline unavailable');
  }
  if (blockedRes.count > 0 && !blockedDeadlineRes.data?.deadline) {
    throw new Error('Blocked Offline24 deadline unavailable');
  }
  return {
    pending: pendingRes.count,
    failed: failedRes.count,
    oldestDeadline: oldestRes.data?.deadline ?? null,
    blockedByEnvironment: blockedRes.count,
    nearestBlockedDeadline: blockedDeadlineRes.data?.deadline ?? null,
  };
}
