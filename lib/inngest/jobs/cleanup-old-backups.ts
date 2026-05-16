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

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { deleteSnapshot } from '@/lib/backup/r2-backup-client';
import { createAdminClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

const DAILY_RETENTION_DAYS = 30;
const WEEKLY_RETENTION_DAYS = 56;

interface BackupLogRow {
  id: string;
  kind: 'daily' | 'weekly' | 'manual';
  r2_key: string | null;
  started_at: string;
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

export const cleanupOldBackupsJob = inngest.createFunction(
  {
    id: 'cleanup-old-backups',
    name: 'Backup: cleanup starych snapshotów (retention)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 4 * * *')],
  },
  async ({ step }) => {
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

      return [
        ...(dailyRes.data ?? []),
        ...(weeklyRes.data ?? []),
      ];
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
  },
);
