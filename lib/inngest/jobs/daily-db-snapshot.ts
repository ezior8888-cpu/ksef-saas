// Cron job: codzienny snapshot DB do R2 (Faza 29).
//
// Trigger: 02:00 PL codziennie. Low-traffic window — w razie performance hitu
// userzy śpią. W niedziele kind='weekly' (zostaje 8 tygodni vs 30 dni daily).
//
// Concurrency: limit 1. Snapshot na pełnym dumpem może trwać kilka minut przy
// rosnącym wolumenie — równoległe wywołania zarżnęłyby DB.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { sendSlackAlert } from '@/lib/alerts/slack';
import {
  logBackupFailure,
  logBackupStart,
  logBackupSuccess,
} from '@/lib/backup/backup-log';
import { createDbSnapshot } from '@/lib/backup/db-snapshot';
import { inngest } from '@/lib/inngest/client';

export const dailyDbSnapshotJob = inngest.createFunction(
  {
    id: 'daily-db-snapshot',
    name: 'Backup: daily DB snapshot to R2',
    concurrency: { limit: 1 },
    // 02:00 PL codziennie. Niedziele = weekly (dłuższa retencja).
    triggers: [cron('TZ=Europe/Warsaw 0 2 * * *')],
  },
  async ({ step }) => {
    const now = new Date();
    // 0=ndz w UTC; przy 02:00 PL = 00:00 albo 01:00 UTC, wciąż niedziela.
    const kind = now.getUTCDay() === 0 ? 'weekly' : 'daily';

    const logId = await step.run('log-start', async () => {
      return await logBackupStart(kind);
    });

    const startedAt = Date.now();

    try {
      const result = await step.run('snapshot', async () => {
        return await createDbSnapshot({ kind, now });
      });

      await step.run('log-success', async () => {
        await logBackupSuccess(logId, {
          r2_key: result.r2KeyRelative,
          size_bytes: result.sizeBytes,
          row_counts: result.rowCounts,
          checksum: result.checksum,
          duration_ms: result.durationMs,
        });
      });

      await step.run('slack-success', async () => {
        await sendSlackAlert({
          channel: 'metrics',
          text: `✅ ${kind === 'weekly' ? 'Weekly' : 'Daily'} DB snapshot zakończony.`,
          context: {
            kind,
            size_mb: (result.sizeBytes / 1024 / 1024).toFixed(2),
            duration_s: (result.durationMs / 1000).toFixed(1),
            tables: Object.keys(result.rowCounts).length,
          },
        });
      });

      return {
        kind,
        size_bytes: result.sizeBytes,
        duration_ms: result.durationMs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'unknown';
      Sentry.captureException(err, {
        tags: { job: 'daily-db-snapshot', kind },
      });

      await step.run('log-failure', async () => {
        await logBackupFailure(logId, errorMessage, Date.now() - startedAt);
      });

      await step.run('slack-failure', async () => {
        await sendSlackAlert({
          channel: 'urgent',
          text: `❌ DB snapshot FAILED — RPO at risk. Sprawdź Sentry.`,
          context: { kind, error: errorMessage.slice(0, 200) },
        });
      });

      throw err;
    }
  },
);
