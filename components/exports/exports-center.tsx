'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  downloadExportFileAction,
  startExportAction,
} from '@/app/actions/exports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Constants, type Tables } from '@/types/database';

/** Wiersz joba + pliki z nested select (historia ręcznych eksportów). */
export type ManualExportJobWithFiles = Tables<'export_jobs'> & {
  export_files: Pick<
    Tables<'export_files'>,
    'id' | 'filename' | 'format' | 'size_bytes' | 'download_count'
  >[];
};

type ExportFormat = Tables<'export_jobs'>['format'];
type JobStatus = Tables<'export_jobs'>['status'];

const EXPORT_FORMATS = Constants.public.Enums.export_format_enum;

const FORMAT_LABELS: Record<ExportFormat, string> = {
  jpk_fa: 'JPK_FA(4)',
  kpir_excel: 'KPiR Excel',
  comarch_optima: 'Comarch Optima',
  insert_subiekt: 'Insert Subiekt',
  symfonia: 'Symfonia',
  wapro: 'Wapro Mag',
  csv_universal: 'CSV uniwersalny',
};

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentMonthStart(): string {
  const d = new Date();
  return toIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

function getCurrentMonthEnd(): string {
  const d = new Date();
  return toIsoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const day = iso.slice(0, 10);
  const [y, m, dd] = day.split('-').map(Number);
  if (!y || !m || !dd) return iso;
  return new Date(y, m - 1, dd).toLocaleDateString('pl-PL');
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export interface ExportsCenterProps {
  recentJobs: ManualExportJobWithFiles[];
}

export function ExportsCenter({ recentJobs }: ExportsCenterProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Eksport danych księgowych
        </h1>
        <p className="mt-2 text-muted-foreground">
          Wygeneruj plik dla księgowego za dowolny okres
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NewExportForm />
        <RecentExports jobs={recentJobs} />
      </div>
    </div>
  );
}

// ============================================================================
// Form: nowy eksport
// ============================================================================

function NewExportForm() {
  const router = useRouter();
  const [format, setFormat] = useState<ExportFormat>('jpk_fa');
  const [periodStart, setPeriodStart] = useState(getCurrentMonthStart);
  const [periodEnd, setPeriodEnd] = useState(getCurrentMonthEnd);
  const [includeIssued, setIncludeIssued] = useState(true);
  const [includeReceived, setIncludeReceived] = useState(false);
  const [includeCorrections, setIncludeCorrections] = useState(true);
  const [isStarting, startExport] = useTransition();

  const handleStart = () => {
    startExport(async () => {
      const result = await startExportAction({
        format,
        periodStart,
        periodEnd,
        includeIssued,
        includeReceived,
        includeCorrections,
      });

      if (result.success) {
        toast.success(
          'Eksport rozpoczęty — plik za chwilę będzie do pobrania',
        );
        setTimeout(() => {
          router.refresh();
        }, 3000);
      } else {
        toast.error(result.error);
      }
    });
  };

  const setPreviousMonth = () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    setPeriodStart(toIsoLocal(start));
    setPeriodEnd(toIsoLocal(end));
  };

  const setCurrentMonth = () => {
    setPeriodStart(getCurrentMonthStart());
    setPeriodEnd(getCurrentMonthEnd());
  };

  const setCurrentQuarter = () => {
    const d = new Date();
    const quarter = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), quarter * 3, 1);
    const end = new Date(d.getFullYear(), quarter * 3 + 3, 0);
    setPeriodStart(toIsoLocal(start));
    setPeriodEnd(toIsoLocal(end));
  };

  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold tracking-tighter-text">
          Nowy eksport
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Wygeneruj plik za wybrany okres
        </p>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Format
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={isStarting}
              onClick={() => setFormat(value)}
              className={`text-left p-3 rounded-2xl border transition-all duration-200 ease-apple active:scale-[0.98] disabled:opacity-50 ${
                format === value
                  ? 'bg-foreground/5 border-foreground/30'
                  : 'bg-glass-white border-glass-border hover:bg-glass-white-strong'
              }`}
            >
              <p className="font-medium text-sm">{FORMAT_LABELS[value]}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Okres
        </Label>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setPreviousMonth}
          >
            Poprzedni miesiąc
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setCurrentMonth}
          >
            Bieżący miesiąc
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setCurrentQuarter}
          >
            Kwartał
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Od
            </Label>
            <Input
              type="date"
              value={periodStart}
              disabled={isStarting}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Do
            </Label>
            <Input
              type="date"
              value={periodEnd}
              disabled={isStarting}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Co dołączyć
        </Label>

        <CheckboxItem
          label="Faktury wystawione"
          checked={includeIssued}
          disabled={isStarting}
          onChange={setIncludeIssued}
        />
        <CheckboxItem
          label="Faktury otrzymane (zakupowe)"
          checked={includeReceived}
          disabled={isStarting}
          onChange={setIncludeReceived}
        />
        <CheckboxItem
          label="Korekty"
          checked={includeCorrections}
          disabled={isStarting}
          onChange={setIncludeCorrections}
        />
      </div>

      <Button
        variant="glass-primary"
        size="lg"
        type="button"
        onClick={handleStart}
        disabled={
          isStarting || (!includeIssued && !includeReceived)
        }
        className="w-full"
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 mr-2" />
        )}
        Wygeneruj plik
      </Button>
    </div>
  );
}

// ============================================================================
// Recent exports
// ============================================================================

function RecentExports({ jobs }: { jobs: ManualExportJobWithFiles[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8">
        <h2 className="text-lg font-display font-semibold tracking-tighter-text mb-2">
          Historia eksportów
        </h2>
        <div className="py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Brak eksportów. Wygeneruj pierwszy plik po lewej.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold tracking-tighter-text">
          Historia eksportów
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ostatnie {jobs.length} eksportów
        </p>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {jobs.map((job) => (
          <ExportJobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function ExportJobRow({ job }: { job: ManualExportJobWithFiles }) {
  const router = useRouter();
  const [isDownloading, startDownload] = useTransition();

  const file = job.export_files?.[0];

  const handleDownload = () => {
    if (!file) {
      toast.error('Brak pliku — eksport mógł się nie udać');
      return;
    }

    startDownload(async () => {
      const result = await downloadExportFileAction(file.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const blob = base64ToBlob(result.base64, result.mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Plik pobrany');
      router.refresh();
    });
  };

  const statusMap: Record<
    JobStatus,
    { icon: typeof CheckCircle2; label: string; className: string; spin?: boolean }
  > = {
    completed: {
      icon: CheckCircle2,
      label: 'Gotowe',
      className: 'text-green-600 dark:text-green-400',
    },
    failed: {
      icon: AlertCircle,
      label: 'Błąd',
      className: 'text-red-600 dark:text-red-400',
    },
    generating: {
      icon: Loader2,
      label: 'Generowanie',
      className: 'text-orange-600 dark:text-orange-400 animate-spin',
    },
    pending: {
      icon: Clock,
      label: 'Oczekuje',
      className: 'text-muted-foreground',
    },
    expired: {
      icon: Clock,
      label: 'Wygasłe',
      className: 'text-muted-foreground',
    },
  };

  const statusConfig = statusMap[job.status];

  const StatusIcon = statusConfig.icon;
  const periodLabel = `${formatDate(job.period_start)} — ${formatDate(job.period_end)}`;

  return (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-foreground/2 border border-glass-border/50 hover:bg-foreground/4 transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <StatusIcon
          className={`h-4 w-4 shrink-0 ${statusConfig.className}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">
            {FORMAT_LABELS[job.format] ?? job.format}
          </p>
          <p className="text-xs text-muted-foreground">
            {periodLabel} • {job.invoices_count ?? 0} faktur
          </p>
        </div>
      </div>

      {job.status === 'completed' && file ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="shrink-0"
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1.5" />
          )}
          Pobierz
        </Button>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function CheckboxItem({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-2 p-2 rounded-xl hover:bg-foreground/2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      <div
        className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
          checked ? 'bg-foreground border-foreground' : 'border-foreground/20'
        }`}
      >
        {checked ? (
          <CheckCircle2 className="h-2.5 w-2.5 text-background" aria-hidden />
        ) : null}
      </div>
      <span className="text-sm">{label}</span>
    </button>
  );
}
