import { AlertTriangle, CheckCircle2, Archive } from 'lucide-react';
import type { BackupOverview } from '@/lib/admin/backups';
import { cn } from '@/lib/utils';

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatHours(h: number | null): string {
  if (h === null) return 'brak danych';
  if (h < 1) return `${Math.round(h * 60)} min temu`;
  if (h < 24) return `${h.toFixed(1)} h temu`;
  return `${Math.floor(h / 24)} d temu`;
}

/**
 * Backup status card w admin /system (Faza 29 Krok 8).
 *
 * Tony:
 *   - success (zielony): ostatni snapshot < 25h temu, brak failures
 *   - warning (amber): ostatni snapshot 25-36h temu, lub recent failure
 *   - danger (red):    ostatni snapshot > 36h albo wszystkie failed
 */
export function BackupStatusCard({ overview }: { overview: BackupOverview }) {
  const { lastDaily, lastWeekly, hoursSinceLastSuccess, hasRecentFailure } =
    overview;

  let tone: 'success' | 'warning' | 'danger' = 'success';
  if (
    hoursSinceLastSuccess === null ||
    hoursSinceLastSuccess > 36
  ) {
    tone = 'danger';
  } else if (hoursSinceLastSuccess > 25 || hasRecentFailure) {
    tone = 'warning';
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
        tone === 'danger' && 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {tone === 'danger' ? (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        ) : tone === 'warning' ? (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        <Archive className="h-3 w-3" />
        Backup
      </div>

      <p className="mt-1 font-display text-2xl font-semibold tracking-tighter-display tabular-nums">
        {formatHours(hoursSinceLastSuccess)}
      </p>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Ostatni daily</span>
          <span className="font-mono">
            {lastDaily
              ? `${lastDaily.status === 'success' ? '✅' : '❌'} ${formatBytes(lastDaily.sizeBytes)}`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ostatni weekly</span>
          <span className="font-mono">
            {lastWeekly
              ? `${lastWeekly.status === 'success' ? '✅' : '❌'} ${formatBytes(lastWeekly.sizeBytes)}`
              : '—'}
          </span>
        </div>
      </div>

      {tone === 'danger' && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">
          RPO breached — sprawdź <code className="font-mono">backup_log</code>{' '}
          i <code className="font-mono">daily-db-snapshot</code> w Inngest.
        </p>
      )}
    </div>
  );
}
