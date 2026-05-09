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
import { cn } from '@/lib/utils';
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
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div>
        <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
          Eksport danych księgowych
        </h1>
        <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          Wygeneruj plik dla księgowego za dowolny okres
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NewExportForm />
        <RecentExports jobs={recentJobs} />
      </div>
    </div>
  );
}

// ============================================================================
// Form: nowy eksport
// ============================================================================

export function NewExportForm() {
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
    <div className="ff-glass-pane space-y-5 rounded-[var(--ff-radius-lg)] p-7 lg:p-8">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
          Nowy eksport
        </h2>
        <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          Wygeneruj plik za wybrany okres
        </p>
      </div>

      <div>
        <Label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          Format
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={isStarting}
              onClick={() => setFormat(value)}
              className={cn(
                'rounded-[var(--ff-radius-lg)] border p-3 text-left transition-all duration-200 active:scale-[0.98] disabled:opacity-50',
                format === value
                  ? 'border-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--ff-primary)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--ff-primary)_25%,transparent)]'
                  : 'border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)] hover:border-white/20 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_7%,transparent)]',
              )}
            >
              <p className="text-[13px] font-bold text-[var(--ff-on-surface)]">
                {FORMAT_LABELS[value]}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          Okres
        </Label>

        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setPreviousMonth}
            className="ff-glass-pane ff-glass-pane-hover border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_40%,transparent)] hover:text-[var(--ff-primary)]"
          >
            Poprzedni miesiąc
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setCurrentMonth}
            className="ff-glass-pane ff-glass-pane-hover border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_40%,transparent)] hover:text-[var(--ff-primary)]"
          >
            Bieżący miesiąc
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isStarting}
            onClick={setCurrentQuarter}
            className="ff-glass-pane ff-glass-pane-hover border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_40%,transparent)] hover:text-[var(--ff-primary)]"
          >
            Kwartał
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
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
            <Label className="mb-1 block text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
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
        <Label className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
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
        variant="outline"
        size="lg"
        type="button"
        onClick={handleStart}
        disabled={
          isStarting || (!includeIssued && !includeReceived)
        }
        className="ff-glass-pane ff-glass-pane-hover w-full border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--ff-primary)_8%,transparent)] hover:text-[var(--ff-primary)] disabled:opacity-40"
      >
        {isStarting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileText className="mr-2 h-4 w-4" />
        )}
        Wygeneruj plik
      </Button>
    </div>
  );
}

// ============================================================================
// Recent exports
// ============================================================================

export function RecentExports({ jobs }: { jobs: ManualExportJobWithFiles[] }) {
  if (jobs.length === 0) {
    return (
      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-7 lg:p-8">
        <h2 className="mb-1 text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
          Historia eksportów
        </h2>
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
              folder_open
            </span>
          </div>
          <p className="mx-auto max-w-sm text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Brak eksportów. Wygeneruj pierwszy plik po lewej.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ff-glass-pane space-y-4 rounded-[var(--ff-radius-lg)] p-7 lg:p-8">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
          Historia eksportów
        </h2>
        <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          Ostatnie {jobs.length} eksportów
        </p>
      </div>

      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
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
      className: 'text-emerald-300',
    },
    failed: {
      icon: AlertCircle,
      label: 'Błąd',
      className: 'text-red-300',
    },
    generating: {
      icon: Loader2,
      label: 'Generowanie',
      className: 'text-orange-300 animate-spin',
    },
    pending: {
      icon: Clock,
      label: 'Oczekuje',
      className: 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]',
    },
    expired: {
      icon: Clock,
      label: 'Wygasłe',
      className: 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]',
    },
  };

  const statusConfig = statusMap[job.status];

  const StatusIcon = statusConfig.icon;
  const periodLabel = `${formatDate(job.period_start)} — ${formatDate(job.period_end)}`;

  return (
    <div className="ff-glass-pane ff-glass-pane-hover flex items-center justify-between gap-3 rounded-[var(--ff-radius-lg)] border border-white/8 p-3 transition-transform active:scale-[0.99]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StatusIcon
          className={cn('h-4 w-4 shrink-0', statusConfig.className)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-[var(--ff-on-surface)]">
            {FORMAT_LABELS[job.format] ?? job.format}
          </p>
          <p className="text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            {periodLabel} • {job.invoices_count ?? 0} faktur
          </p>
        </div>
      </div>

      {job.status === 'completed' && file ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="ff-glass-pane ff-glass-pane-hover shrink-0 border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] hover:text-[var(--ff-primary)]"
        >
          {isDownloading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
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
      className="flex w-full items-center gap-3 rounded-[var(--ff-radius-lg)] border border-transparent p-2.5 text-left transition-colors hover:border-white/10 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)] disabled:pointer-events-none disabled:opacity-50"
    >
      <div
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked
            ? 'border-[var(--ff-primary)] bg-[color-mix(in_srgb,var(--ff-primary)_22%,transparent)]'
            : 'border-white/20 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]',
        )}
      >
        {checked ? (
          <CheckCircle2
            className="h-3 w-3 text-[var(--ff-primary)]"
            aria-hidden
          />
        ) : null}
      </div>
      <span className="text-[14px] font-medium text-[var(--ff-on-surface)]">
        {label}
      </span>
    </button>
  );
}
