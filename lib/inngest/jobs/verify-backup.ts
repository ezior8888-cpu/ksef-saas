// Cron job: cotygodniowa weryfikacja ostatnich snapshotów (Faza 29 Krok 5).
//
// Trigger: niedziela 03:00 PL (godzinę po dailyDbSnapshot — czekamy aż się
// skończy zanim sprawdzamy). Bierze ostatnie 7 successful snapshotów,
// dla każdego: download + checksum + parse + row count drift.
//
// Cel: wykrycie bit-rot, corrupted gzip, R2 storage drift. RPO defense.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { sendSlackAlert } from '@/lib/alerts/slack';
import { verifySnapshot } from '@/lib/backup/verify';
import { createAdminClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

interface BackupLogRow {
  id: string;
  kind: 'daily' | 'weekly' | 'manual';
  r2_key: string | null;
  checksum: string | null;
  row_counts: Record<string, number> | null;
  started_at: string;
}

interface AdminBackupQuery {
  from: (n: 'backup_log') => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        not: (
          k: string,
          op: 'is',
          v: null,
        ) => {
          order: (
            k: string,
            opts: { ascending: boolean },
          ) => {
            limit: (
              n: number,
            ) => Promise<{
              data: BackupLogRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

const VERIFY_BATCH = 7;

export const verifyBackupJob = inngest.createFunction(
  {
    id: 'verify-backup',
    name: 'Backup: weekly verify ostatnich snapshotów',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 3 * * 0')], // niedziela 03:00 PL
  },
  async ({ step }) => {
    const recent = await step.run('list-recent', async () => {
      const admin = createAdminClient() as unknown as AdminBackupQuery;
      const res = await admin
        .from('backup_log')
        .select('id, kind, r2_key, checksum, row_counts, started_at')
        .eq('status', 'success')
        .not('r2_key', 'is', null)
        .order('started_at', { ascending: false })
        .limit(VERIFY_BATCH);
      return res.data ?? [];
    });

    if (recent.length === 0) {
      await sendSlackAlert({
        channel: 'urgent',
        text: '⚠️ Brak successful backupów do weryfikacji — sprawdź snapshot job.',
      });
      return { verified: 0, failed: 0 };
    }

    let verified = 0;
    let failed = 0;
    const failures: Array<{ id: string; errors: string[]; warnings: string[] }> = [];

    for (const row of recent) {
      const result = await step.run(`verify-${row.id}`, async () => {
        try {
          return await verifySnapshot({
            r2KeyRelative: row.r2_key!,
            expectedChecksum: row.checksum ?? '',
            snapshotRowCounts: row.row_counts ?? {},
          });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { job: 'verify-backup', backup_id: row.id },
          });
          return {
            ok: false,
            errors: [`exception: ${err instanceof Error ? err.message : 'unknown'}`],
            warnings: [],
            rowCountDiff: [],
          };
        }
      });

      if (result.ok) {
        verified++;
      } else {
        failed++;
        failures.push({
          id: row.id,
          errors: result.errors,
          warnings: result.warnings,
        });
      }
    }

    if (failed > 0) {
      await sendSlackAlert({
        channel: 'urgent',
        text: `❌ Backup verify: ${failed}/${recent.length} snapshot(s) BROKEN`,
        context: {
          verified,
          failed,
          first_error: failures[0]?.errors[0] ?? 'none',
          failed_ids: failures.map((f) => f.id.slice(0, 8)).join(', '),
        },
      });
    } else {
      await sendSlackAlert({
        channel: 'metrics',
        text: `✅ Backup verify: ${verified}/${recent.length} snapshotów OK`,
        context: { verified, failed },
      });
    }

    return { verified, failed };
  },
);
