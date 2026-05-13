import { AlertTriangle, CheckCircle2, Cloud, Cog, Database } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  getDbStats,
  getInngestJobStats,
  getKsefHealthHistory,
  getOfflineQueueSnapshot,
  type InngestJobStat,
} from '@/lib/admin/system';
import { cn } from '@/lib/utils';
import type { KsefEnvironment } from '@/types/ksef';

import { HealthTimeline } from './_components/health-timeline';

export const dynamic = 'force-dynamic';

const WINDOW_HOURS = 24;

function currentKsefEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function AdminSystemPage() {
  const env = currentKsefEnv();

  const [healthHistory, jobStats, dbStats, offline] = await Promise.all([
    getKsefHealthHistory(env, WINDOW_HOURS).catch(() => []),
    getInngestJobStats(WINDOW_HOURS).catch(() => []),
    getDbStats().catch(() => ({ totalDatabaseBytes: 0, tables: [] })),
    getOfflineQueueSnapshot().catch(() => ({
      pending: 0,
      failed: 0,
      oldestDeadline: null,
    })),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tighter-display">
          System
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stan infrastruktury w czasie rzeczywistym. KSeF env:{' '}
          <Badge variant="outline" className="font-mono">{env}</Badge>
        </p>
      </header>

      {/* KSeF health timeline */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          KSeF health (ostatnie {WINDOW_HOURS}h)
        </h2>
        <HealthTimeline entries={healthHistory} windowHours={WINDOW_HOURS} />
      </section>

      {/* Offline queue + DB size summary */}
      <section className="grid gap-3 sm:grid-cols-3">
        <OfflineQueueCard
          pending={offline.pending}
          failed={offline.failed}
          oldestDeadline={offline.oldestDeadline}
        />
        <Kpi
          icon={Database}
          label="Rozmiar bazy"
          value={formatBytes(dbStats.totalDatabaseBytes)}
          sublabel={
            dbStats.tables.length > 0
              ? `${dbStats.tables.length} tabel w public`
              : 'RPC niedostępny — wymaga migracji 00044'
          }
        />
        <Kpi
          icon={Cog}
          label="Inngest aktywność 24h"
          value={String(
            jobStats.reduce((sum, j) => sum + j.totalRuns, 0),
          )}
          sublabel={`${jobStats.filter((j) => j.errorCount > 0).length} jobów z błędami`}
          tone={
            jobStats.some((j) => j.errorCount / Math.max(1, j.totalRuns) > 0.2)
              ? 'warning'
              : 'default'
          }
        />
      </section>

      {/* Inngest jobs table */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Cog className="h-4 w-4 text-muted-foreground" />
          Inngest jobs (24h)
        </h2>
        {jobStats.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Brak runów w `inngest_run_log` z ostatnich 24h. Pamiętaj że
            `inngest-run-log` (Faza 5) musi być wpinane explicit przez handlery —
            nie wszystkie joby tam piszą.
          </p>
        ) : (
          <InngestJobsTable jobs={jobStats} />
        )}
      </section>

      {/* DB tables size */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Rozmiar tabel (top 20)
        </h2>
        {dbStats.tables.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            RPC `admin_table_sizes` niedostępny. Wgraj migrację{' '}
            <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
              00044_system_dashboard.sql
            </code>
            .
          </p>
        ) : (
          <DbTablesTable tables={dbStats.tables.slice(0, 20)} />
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/5',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tighter-display tabular-nums">
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      ) : null}
    </div>
  );
}

function OfflineQueueCard({
  pending,
  failed,
  oldestDeadline,
}: {
  pending: number;
  failed: number;
  oldestDeadline: string | null;
}) {
  const hasIssue = pending > 0 || failed > 0;
  return (
    <div
      className={cn(
        'rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass',
        hasIssue ? 'border-amber-500/30 bg-amber-500/5' : '',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {hasIssue ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        Offline24 queue
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <p className="font-display text-2xl font-semibold tracking-tighter-display tabular-nums">
          {pending}
        </p>
        {failed > 0 ? (
          <span className="text-xs text-red-700 dark:text-red-300">
            +{failed} failed
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {oldestDeadline
          ? `Najstarszy deadline: ${new Date(oldestDeadline).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
          : 'Brak zaległości — wszystko płynie'}
      </p>
    </div>
  );
}

function InngestJobsTable({ jobs }: { jobs: InngestJobStat[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
      <table className="w-full text-sm">
        <thead className="border-b border-glass-border">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Event</th>
            <th className="px-4 py-2.5 font-medium text-right">Runów</th>
            <th className="px-4 py-2.5 font-medium text-right">Success</th>
            <th className="px-4 py-2.5 font-medium text-right">Error</th>
            <th className="px-4 py-2.5 font-medium text-right">Error rate</th>
            <th className="px-4 py-2.5 font-medium text-right">Avg duration</th>
            <th className="px-4 py-2.5 font-medium">Ostatni run</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const errorRate = j.totalRuns > 0 ? j.errorCount / j.totalRuns : 0;
            const errorPct = (errorRate * 100).toFixed(1);
            const rowTone =
              errorRate > 0.2 ? 'bg-amber-500/5' : errorRate > 0.5 ? 'bg-red-500/5' : '';
            return (
              <tr key={j.eventName} className={cn('border-b border-glass-border last:border-0', rowTone)}>
                <td className="px-4 py-2.5 font-mono text-xs">{j.eventName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{j.totalRuns}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {j.successCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {j.errorCount > 0 ? (
                    <span className="text-red-700 dark:text-red-400">{j.errorCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {errorRate > 0 ? (
                    <Badge
                      variant={errorRate > 0.2 ? 'destructive' : 'outline'}
                      className="text-xs"
                    >
                      {errorPct}%
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {j.avgDurationMs !== null ? `${j.avgDurationMs}ms` : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {new Date(j.lastRunAt).toLocaleString('pl-PL', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DbTablesTable({
  tables,
}: {
  tables: Array<{ tableName: string; totalBytes: number; rowEstimate: number }>;
}) {
  const maxBytes = Math.max(...tables.map((t) => t.totalBytes), 1);
  return (
    <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
      <table className="w-full text-sm">
        <thead className="border-b border-glass-border">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Tabela</th>
            <th className="px-4 py-2.5 font-medium text-right">Rozmiar</th>
            <th className="px-4 py-2.5 font-medium text-right">Wierszy (szac.)</th>
            <th className="px-4 py-2.5 font-medium">Wizualnie</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => {
            const pct = (t.totalBytes / maxBytes) * 100;
            return (
              <tr key={t.tableName} className="border-b border-glass-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{t.tableName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatBytes(t.totalBytes)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {t.rowEstimate.toLocaleString('pl-PL')}
                </td>
                <td className="px-4 py-2.5">
                  <div className="relative h-2 w-full rounded-full bg-foreground/5">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-foreground/40"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
