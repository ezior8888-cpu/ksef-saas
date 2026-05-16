import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createAdminClient } from '@/lib/supabase/server';
import { downloadSnapshot } from './r2-backup-client';

/**
 * Weryfikacja integralności snapshotu (Faza 29 Krok 4).
 *
 * Robi 3 sprawdzenia:
 *   1. Checksum — pobieramy z R2, liczymy SHA-256, porównujemy z
 *      `backup_log.checksum`. Bit-rot detection.
 *   2. Parse — gunzip + JSON.parse. Sprawdza czy nie ucięty / corrupted.
 *   3. Sample row counts — porównanie row_counts ze snapshotu z bieżącym
 *      stanem DB. Pozwala wykryć: czy snapshot nie jest podejrzanie pusty
 *      (czyli czy ostatnio nie sypnęło się z RLS / connectivity).
 *
 * `tolerancePercent` (default 50%) — bieżący DB może mieć ±50% rows
 * względem snapshotu z 24h temu i to OK. Większe odchyły = alert.
 */

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Per-table porównanie: snapshot vs current. */
  rowCountDiff: Array<{
    table: string;
    snapshot: number;
    current: number;
    diffPct: number;
  }>;
}

interface VerifyInput {
  /** R2 key (relative, np. `db/2026/05/15-020000.json.gz`). */
  r2KeyRelative: string;
  expectedChecksum: string;
  /** Wartość z `backup_log.row_counts`. */
  snapshotRowCounts: Record<string, number>;
  /** % różnicy wobec bieżącego stanu wybierającej alert. Default 50. */
  tolerancePercent?: number;
}

interface SnapshotPayloadShape {
  version: number;
  created_at: string;
  kind: string;
  row_counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

interface AdminCountClient {
  from: (n: string) => {
    select: (
      c: string,
      opts: { count: 'exact'; head: true },
    ) => Promise<{ count: number | null; error: { message: string } | null }>;
  };
}

export async function verifySnapshot(input: VerifyInput): Promise<VerifyResult> {
  const tolerance = input.tolerancePercent ?? 50;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Pełny key — `r2KeyRelative` jest bez prefixu, build snapshot key już go
  // dodaje. Tu rekonstruujemy: prefix obliczony jak w r2-backup-client.
  const ctxPrefix =
    process.env.R2_BACKUPS_BUCKET?.trim() &&
    !process.env.R2_BACKUPS_BUCKET.startsWith('x')
      ? ''
      : 'backups/';
  const fullKey = `${ctxPrefix}${input.r2KeyRelative}`;

  // 1. Download + checksum
  let gzipped: Buffer;
  try {
    gzipped = await downloadSnapshot(fullKey);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `download_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      ],
      warnings: [],
      rowCountDiff: [],
    };
  }

  const actualChecksum = createHash('sha256').update(gzipped).digest('hex');
  if (actualChecksum !== input.expectedChecksum) {
    errors.push(
      `checksum_mismatch: expected=${input.expectedChecksum.slice(0, 8)}… actual=${actualChecksum.slice(0, 8)}…`,
    );
  }

  // 2. Parse
  let payload: SnapshotPayloadShape;
  try {
    const json = gunzipSync(gzipped).toString('utf-8');
    payload = JSON.parse(json) as SnapshotPayloadShape;
  } catch (err) {
    return {
      ok: false,
      errors: [
        ...errors,
        `parse_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      ],
      warnings: [],
      rowCountDiff: [],
    };
  }

  if (!payload.version || !payload.tables || !payload.row_counts) {
    errors.push('invalid_structure');
  }

  // 3. Sample row count comparison.
  const admin = createAdminClient() as unknown as AdminCountClient;
  const diff: VerifyResult['rowCountDiff'] = [];
  for (const [table, snapshotCount] of Object.entries(input.snapshotRowCounts)) {
    try {
      const { count, error } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true });
      if (error) {
        warnings.push(`count_failed:${table}:${error.message}`);
        continue;
      }
      const current = count ?? 0;
      const diffPct =
        snapshotCount === 0
          ? current === 0
            ? 0
            : 100
          : Math.abs((current - snapshotCount) / snapshotCount) * 100;
      diff.push({ table, snapshot: snapshotCount, current, diffPct });
      if (diffPct > tolerance) {
        warnings.push(
          `row_count_drift:${table}:snapshot=${snapshotCount} current=${current} diff=${diffPct.toFixed(0)}%`,
        );
      }
    } catch (err) {
      warnings.push(
        `count_exception:${table}:${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rowCountDiff: diff,
  };
}
