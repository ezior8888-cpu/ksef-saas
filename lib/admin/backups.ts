import { getLastBackup, type LastBackupSummary } from '@/lib/backup/backup-log';

/**
 * Snapshot stanu backupów dla admin /system (Faza 29 Krok 8).
 *
 * Pokazuje ostatni daily + weekly snapshot, status, rozmiar, age. UI używa
 * tego do KPI "Backup status: ✅ 4h temu, 4.2 MB".
 */

export interface BackupOverview {
  lastDaily: LastBackupSummary | null;
  lastWeekly: LastBackupSummary | null;
  /** Najbardziej krytyczna metryka — wiek najnowszego success snapshotu w godzinach. */
  hoursSinceLastSuccess: number | null;
  /** True gdy ostatni daily lub weekly failed. */
  hasRecentFailure: boolean;
}

export async function getBackupOverview(): Promise<BackupOverview> {
  const [lastDaily, lastWeekly] = await Promise.all([
    getLastBackup('daily'),
    getLastBackup('weekly'),
  ]);

  // Najnowszy success z dowolnego rodzaju.
  const successes: Date[] = [];
  if (lastDaily?.status === 'success') successes.push(lastDaily.startedAt);
  if (lastWeekly?.status === 'success') successes.push(lastWeekly.startedAt);
  const newest = successes.length > 0 ? Math.max(...successes.map((d) => d.getTime())) : null;
  const hoursSinceLastSuccess =
    newest === null ? null : (Date.now() - newest) / (1000 * 60 * 60);

  const hasRecentFailure =
    lastDaily?.status === 'failed' || lastWeekly?.status === 'failed';

  return {
    lastDaily,
    lastWeekly,
    hoursSinceLastSuccess,
    hasRecentFailure,
  };
}
