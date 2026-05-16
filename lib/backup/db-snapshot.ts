import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createAdminClient } from '@/lib/supabase/server';
import { buildSnapshotKey, uploadSnapshot } from './r2-backup-client';

/**
 * Wielkość batcha dla paginacji per tabela. Supabase REST `range(a, b)`.
 * 1000 to sweet spot — większe = ryzyko timeout na PostgREST.
 */
const PAGE_SIZE = 1000;

/**
 * Tabele które celowo POMIJAMY w snapshot:
 *
 * - `audit_logs` jest gigantyczne i ma osobną retencję 12-mc + już immutable.
 *   Restore z snapshotu i tak by nie pasowało (powstałby duplikat zdarzeń).
 * - `inngest_run_log` — operacyjne, samo się rotuje, nie potrzeba.
 * - `ksef_health_log` — telemetria zewnętrzna, generowana na nowo.
 * - `_supabase_migrations` itp. — system tables.
 *
 * Reszta wszystko z `public.*` leci do snapshotu.
 */
const SKIP_TABLES = new Set([
  'audit_logs',
  'inngest_run_log',
  'ksef_health_log',
  'gdpr_deletion_requests', // PII + ma własną logikę cooling-off, restore by zepsuł flow
]);

interface AdminRpc {
  rpc: (
    fn: 'list_public_tables',
    args?: Record<string, never>,
  ) => Promise<{
    data: Array<{ table_name: string }> | null;
    error: { message: string } | null;
  }>;
}

interface AdminFrom {
  from: (n: string) => {
    select: (c: string, opts?: { count?: 'exact' | 'planned' | 'estimated' }) => {
      range: (
        from: number,
        to: number,
      ) => Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export interface SnapshotResult {
  /** Pełny R2 key, np. backups/db/2026/05/15-020000.json.gz */
  r2KeyFull: string;
  /** Relative — do zapisu w backup_log.r2_key */
  r2KeyRelative: string;
  sizeBytes: number;
  checksum: string;
  rowCounts: Record<string, number>;
  durationMs: number;
}

interface SnapshotPayload {
  version: number;
  created_at: string;
  kind: 'daily' | 'weekly' | 'manual';
  /** SHA-256 hex z gzipped payload — same field as w R2 metadata. */
  row_counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

/**
 * Tworzy pełny snapshot DB: dynamicznie listuje public.*, dla każdej tabeli
 * dumpuje wszystkie wiersze paginowanie, składa JSON, gzip, SHA-256, upload do R2.
 *
 * Synchroniczny ścisk gzip (`gzipSync`) — dla MVP-skali (snapshot < 200 MB)
 * jest OK. Przy wzroście nad ~1 GB trzeba przejść na streaming gzip → multipart
 * upload (TODO przed Fazą 41 open beta).
 */
export async function createDbSnapshot(opts: {
  kind: 'daily' | 'weekly' | 'manual';
  now?: Date;
}): Promise<SnapshotResult> {
  const start = Date.now();
  const now = opts.now ?? new Date();

  const admin = createAdminClient();
  const tables = await listPublicTables(admin as unknown as AdminRpc);

  const dumpedTables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const table of tables) {
    if (SKIP_TABLES.has(table)) continue;
    const rows = await dumpTable(admin as unknown as AdminFrom, table);
    dumpedTables[table] = rows;
    rowCounts[table] = rows.length;
  }

  const payload: SnapshotPayload = {
    version: 1,
    created_at: now.toISOString(),
    kind: opts.kind,
    row_counts: rowCounts,
    tables: dumpedTables,
  };

  const json = JSON.stringify(payload);
  const gzipped = gzipSync(Buffer.from(json, 'utf-8'));
  const checksum = createHash('sha256').update(gzipped).digest('hex');

  const keys = buildSnapshotKey(now);
  await uploadSnapshot(keys.full, gzipped, checksum);

  return {
    r2KeyFull: keys.full,
    r2KeyRelative: keys.relative,
    sizeBytes: gzipped.length,
    checksum,
    rowCounts,
    durationMs: Date.now() - start,
  };
}

async function listPublicTables(admin: AdminRpc): Promise<string[]> {
  const { data, error } = await admin.rpc('list_public_tables');
  if (error || !data) {
    throw new Error(
      `list_public_tables RPC failed: ${error?.message ?? 'no_data'}`,
    );
  }
  return data.map((r) => r.table_name).sort();
}

async function dumpTable(admin: AdminFrom, table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`dump_table_failed: ${table}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}
