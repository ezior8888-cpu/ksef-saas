/**
 * Admin /system dashboard queries (Faza 24 Krok 3).
 *
 * - KSeF health timeline 24h z `ksef_health_log` (Faza 24 migracja 00044)
 * - Inngest jobs agregacja z `inngest_run_log` (success/error ratio, p95 duration)
 * - DB stats — `pg_total_relation_size` przez SECURITY DEFINER RPC
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { KsefEnvironment } from '@/types/ksef';

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
    if (row.status === 'success' || row.status === 'completed') {
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
  pending: number;
  failed: number;
  oldestDeadline: string | null;
}

export async function getOfflineQueueSnapshot(): Promise<OfflineQueueSnapshot> {
  const supabase = createAdminClient();

  const [pendingRes, failedRes, oldestRes] = await Promise.all([
    supabase
      .from('ksef_offline_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('ksef_offline_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    supabase
      .from('ksef_offline_queue')
      .select('deadline')
      .eq('status', 'pending')
      .order('deadline', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pending: pendingRes.count ?? 0,
    failed: failedRes.count ?? 0,
    oldestDeadline: oldestRes.data?.deadline ?? null,
  };
}
