// Cron job: cleanup starych snapshotów (Faza 29 Krok 6).
//
// Retention (z planowania Q2):
//   - daily snapshots: 30 dni
//   - weekly snapshots: 8 tygodni (~56 dni)
//   - manual snapshots: nie ruszamy (admin sam zarządza)
//
// Strategia: backup_log to source of truth. Iterujemy nad rows starszymi
// od retention thresholdu → deleteSnapshot z R2 → DELETE backup_log row.
//
// Trigger: 04:00 PL codziennie (po snapshot + verify). Concurrency 1.

import * as Sentry from '@sentry/nextjs';

import { deleteSnapshot } from '@/lib/backup/r2-backup-client';
import { createAdminClient } from '@/lib/supabase/server';

import type { JobContext } from '@/lib/jobs/registry';

const DAILY_RETENTION_DAYS = 30;
const WEEKLY_RETENTION_DAYS = 56;

/**
 * Tyle najnowszych UDANYCH kopii zostaje zawsze, niezależnie od wieku.
 * Retencja liczona samą datą kasowała ostatnie dobre kopie, gdy nowe od
 * miesiąca się nie udawały — a alerty z workera do 01.10.2026 nie wychodziły
 * (#114). Po 30 dniach cichej awarii nie zostałaby żadna kopia bazy.
 */
const KEEP_LATEST_SUCCESSFUL = 7;

interface BackupLogRow {
  id: string;
  kind: 'daily' | 'weekly' | 'manual';
  r2_key: string | null;
  started_at: string;
}

interface AdminBackupKeep {
  from: (n: 'backup_log') => {
    select: (c: 'id') => {
      eq: (k: 'status', v: 'success') => {
        order: (k: 'started_at', o: { ascending: false }) => {
          limit: (n: number) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

interface AdminBackupCleanup {
  from: (n: 'backup_log') => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        lt: (
          k: string,
          v: string,
        ) => Promise<{
          data: BackupLogRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    delete: () => {
      eq: (
        k: string,
        v: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.cleanup-old-backups).
 */
export async function runCleanupOldBackups({ step }: JobContext) {
    const now = new Date();
    const dailyCutoff = new Date(
      now.getTime() - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const weeklyCutoff = new Date(
      now.getTime() - WEEKLY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const toRemove = await step.run('list-expired', async () => {
      const admin = createAdminClient() as unknown as AdminBackupCleanup;

      const dailyRes = await admin
        .from('backup_log')
        .select('id, kind, r2_key, started_at')
        .eq('kind', 'daily')
        .lt('started_at', dailyCutoff.toISOString());

      const weeklyRes = await admin
        .from('backup_log')
        .select('id, kind, r2_key, started_at')
        .eq('kind', 'weekly')
        .lt('started_at', weeklyCutoff.toISOString());

      // Bez pewności, które kopie są ostatnimi dobrymi, nic nie kasujemy.
      const keepRes = await (admin as unknown as AdminBackupKeep)
        .from('backup_log')
        .select('id')
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(KEEP_LATEST_SUCCESSFUL);
      if (keepRes.error) {
        throw new Error(`backup_keep_lookup_failed: ${keepRes.error.message}`);
      }
      const keep = new Set((keepRes.data ?? []).map((r) => r.id));

      return [
        ...(dailyRes.data ?? []),
        ...(weeklyRes.data ?? []),
      ].filter((r) => !keep.has(r.id));
    });

    if (toRemove.length === 0) {
      return { removed: 0 };
    }

    let removed = 0;
    let failed = 0;
    for (const row of toRemove) {
      const ok = await step.run(`delete-${row.id}`, async () => {
        try {
          // r2_key w bazie jest "relative" (bez prefixu). Rebuild full key.
          if (row.r2_key) {
            const ctxPrefix =
              process.env.R2_BACKUPS_BUCKET?.trim() &&
              !process.env.R2_BACKUPS_BUCKET.startsWith('x')
                ? ''
                : 'backups/';
            await deleteSnapshot(`${ctxPrefix}${row.r2_key}`);
          }
          const admin = createAdminClient() as unknown as AdminBackupCleanup;
          const del = await admin.from('backup_log').delete().eq('id', row.id);
          if (del.error) {
            throw new Error(`backup_log_delete_failed: ${del.error.message}`);
          }
          return true;
        } catch (err) {
          Sentry.captureException(err, {
            tags: { job: 'cleanup-old-backups', backup_id: row.id },
          });
          return false;
        }
      });
      if (ok) removed++;
      else failed++;
    }

    return { removed, failed, total: toRemove.length };
}

