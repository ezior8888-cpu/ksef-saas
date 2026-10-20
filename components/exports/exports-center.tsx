'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  RiCheckLine,
  RiCloseLine,
  RiDownloadLine,
  RiFileChart2Line,
  RiFileCodeLine,
  RiFileExcel2Line,
  RiFileTextLine,
  RiFolderOpenLine,
  RiLoader4Line,
  RiTimeLine,
  type RemixiconComponentType,
} from '@remixicon/react';
import { toast } from 'sonner';

import {
  downloadExportFileAction,
  startExportAction,
} from '@/app/actions/exports';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Constants, type Tables } from '@/types/database';
import { saveBlob } from '@/lib/download';
import { isExportFormatSuspended, SUSPENDED_EXPORT_FORMATS } from '@/lib/exports/suspended-formats';
import { includeReceivedAfterFormatChange, receivedLabelForFormat } from '@/lib/exports/form-defaults';
import { formatIsoDatePl } from '@/lib/format/iso-date';

/** Wiersz joba + pliki z nested select (historia ręcznych eksportów). */
export type ManualExportJobWithFiles = Tables<'export_jobs'> & {
  export_files: Pick<
    Tables<'export_files'>,
    'id' | 'filename' | 'format' | 'size_bytes' | 'download_count'
  >[];
};

// `jpk_v7m` doszło migracją 00056 — `types/database.ts` regenerujemy przed
// Fazą 35, więc rozszerzamy typ i listę formatów lokalnie.
type ExportFormat = Tables<'export_jobs'>['format'] | 'jpk_v7m';
type JobStatus = Tables<'export_jobs'>['status'];

const ALL_EXPORT_FORMATS: ExportFormat[] = [
  'jpk_fa',
  'jpk_v7m',
  ...Constants.public.Enums.export_format_enum.filter((f) => f !== 'jpk_fa'),
];

/** Do wyboru tylko formaty niewstrzymane — wstrzymane opisuje notka pod listą. */
const EXPORT_FORMATS = ALL_EXPORT_FORMATS.filter((f) => !isExportFormatSuspended(f));
const SUSPENDED_NOTES = ALL_EXPORT_FORMATS.filter(isExportFormatSuspended).map(
  (f) => SUSPENDED_EXPORT_FORMATS[f]!,
);

const FORMAT_LABELS: Record<ExportFormat, string> = {
  jpk_fa: 'JPK_FA(4)',
  jpk_v7m: 'JPK_V7M (ewidencja + deklaracja VAT)',
  kpir_excel: 'KPiR Excel',
  comarch_optima: 'Comarch Optima',
  insert_subiekt: 'Insert Subiekt',
  symfonia: 'Symfonia',
  wapro: 'Wapro Mag',
  csv_universal: 'CSV uniwersalny',
};

/** Rodzaj pliku pod nazwą formatu (karta w stylu Accounts Finory). */
const FORMAT_KINDS: Record<ExportFormat, string> = {
  jpk_fa: 'Plik XML',
  jpk_v7m: 'Plik XML',
  kpir_excel: 'Arkusz Excel',
  comarch_optima: 'Program księgowy',
  insert_subiekt: 'Program księgowy',
  symfonia: 'Program księgowy',
  wapro: 'Program księgowy',
  csv_universal: 'Plik CSV',
};

const FORMAT_ICONS: Record<ExportFormat, RemixiconComponentType> = {
  jpk_fa: RiFileCodeLine,
  jpk_v7m: RiFileCodeLine,
  kpir_excel: RiFileExcel2Line,
  comarch_optima: RiFileChart2Line,
  insert_subiekt: RiFileChart2Line,
  symfonia: RiFileChart2Line,
  wapro: RiFileChart2Line,
  csv_universal: RiFileTextLine,
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

/** Nagłówek strony eksportu (jak nagłówek Accounts w Finorze). */
export function ExportsHeading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Eksport danych księgowych</h1>
      <p className="text-muted-foreground text-sm">Wygeneruj plik dla księgowego za dowolny okres</p>
    </div>
  );
}

export function ExportsCenter({ recentJobs }: ExportsCenterProps) {
  return (
    <div className="space-y-6 pb-10">
      <ExportsHeading />
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

  // KPiR bez kosztów to księga z samymi przychodami (F-058).
  const chooseFormat = (value: ExportFormat) => {
    setFormat(value);
    setIncludeReceived((current) => includeReceivedAfterFormatChange(value, current));
  };

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
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Nowy eksport</CardTitle>
        <CardDescription>Wygeneruj plik za wybrany okres</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-muted-foreground">Format</Label>
          {/* Karty formatów w układzie kart rachunków z Accounts (Finora `account-card`). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {EXPORT_FORMATS.map((value) => {
              const Icon = FORMAT_ICONS[value];
              const selected = format === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  disabled={isStarting}
                  onClick={() => chooseFormat(value)}
                  aria-pressed={selected}
                  className={cn(
                    'h-auto w-full flex-col items-stretch gap-4 p-4 text-left whitespace-normal',
                    selected && 'border-primary ring-primary/30 ring-1',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Avatar className="size-9 items-center justify-center">
                      <AvatarFallback className="bg-transparent">
                        <Icon className="text-foreground size-5" />
                      </AvatarFallback>
                    </Avatar>
                    {selected ? (
                      <Badge variant="secondary" className="font-normal">
                        Wybrany
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-foreground font-medium wrap-break-word">{FORMAT_LABELS[value]}</p>
                    <p className="text-muted-foreground text-sm wrap-break-word">{FORMAT_KINDS[value]}</p>
                  </div>
                </Button>
              );
            })}
          </div>
          {SUSPENDED_NOTES.map((note) => (
            <p key={note} className="text-muted-foreground text-xs">
              {note}
            </p>
          ))}
        </div>

        <div className="space-y-3">
          <Label className="text-muted-foreground">Okres</Label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" disabled={isStarting} onClick={setPreviousMonth}>
              Poprzedni miesiąc
            </Button>
            <Button variant="outline" size="sm" type="button" disabled={isStarting} onClick={setCurrentMonth}>
              Bieżący miesiąc
            </Button>
            <Button variant="outline" size="sm" type="button" disabled={isStarting} onClick={setCurrentQuarter}>
              Kwartał
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="export-period-start">Od</Label>
              <Input
                id="export-period-start"
                type="date"
                value={periodStart}
                disabled={isStarting}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-period-end">Do</Label>
              <Input
                id="export-period-end"
                type="date"
                value={periodEnd}
                disabled={isStarting}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Co dołączyć</Label>

          <CheckboxItem
            label="Faktury wystawione"
            checked={includeIssued}
            disabled={isStarting}
            onChange={setIncludeIssued}
          />
          <CheckboxItem
            label={receivedLabelForFormat(format)}
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
          size="lg"
          type="button"
          onClick={handleStart}
          disabled={
            isStarting || (!includeIssued && !includeReceived)
          }
          className="w-full"
        >
          {isStarting ? (
            <RiLoader4Line className="animate-spin" aria-hidden />
          ) : (
            <RiFileTextLine aria-hidden />
          )}
          Wygeneruj plik
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Recent exports
// ============================================================================

export function RecentExports({ jobs }: { jobs: ManualExportJobWithFiles[] }) {
  if (jobs.length === 0) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Historia eksportów</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="bg-muted flex size-12 items-center justify-center">
            <RiFolderOpenLine className="text-foreground size-6" aria-hidden />
          </div>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Brak eksportów. Wygeneruj pierwszy plik po lewej.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Historia eksportów</CardTitle>
        <CardDescription>Ostatnie {jobs.length} eksportów</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[600px] divide-y overflow-y-auto border-y">
          {jobs.map((job) => (
            <ExportJobRow key={job.id} job={job} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Kolory statusów jak `TRANSACTION_STATUS_STYLES` w Finorze.
const STATUS_MAP: Record<
  JobStatus,
  { icon: RemixiconComponentType; label: string; className: string; spin?: boolean }
> = {
  completed: {
    icon: RiCheckLine,
    label: 'Gotowe',
    className: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  },
  failed: {
    icon: RiCloseLine,
    label: 'Błąd',
    className: 'bg-destructive/10 text-destructive',
  },
  generating: {
    icon: RiLoader4Line,
    label: 'Generowanie',
    className: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
    spin: true,
  },
  pending: {
    icon: RiTimeLine,
    label: 'Oczekuje',
    className: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  },
  expired: {
    icon: RiTimeLine,
    label: 'Wygasłe',
    className: 'bg-muted text-muted-foreground',
  },
};

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
      saveBlob(blob, result.filename);

      toast.success('Plik pobrany');
      router.refresh();
    });
  };

  const statusConfig = STATUS_MAP[job.status];

  const StatusIcon = statusConfig.icon;
  const periodLabel = `${formatIsoDatePl(job.period_start)} — ${formatIsoDatePl(job.period_end)}`;

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="after:border-none" title={statusConfig.label}>
          <AvatarFallback className={statusConfig.className}>
            <StatusIcon className={cn('size-4', statusConfig.spin && 'animate-spin')} aria-hidden />
            <span className="sr-only">{statusConfig.label}</span>
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {FORMAT_LABELS[job.format] ?? job.format}
          </p>
          <p className="text-muted-foreground text-xs">
            {periodLabel} • {job.invoices_count ?? 0} faktur
          </p>
          {/* Powód odmowy dla człowieka (np. W9: „JPK wstrzymany: faktura …”). */}
          {job.status === 'failed' && job.error_message ? (
            <p className="text-destructive mt-1 text-xs">{job.error_message}</p>
          ) : null}
        </div>
      </div>

      {job.status === 'completed' && file ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="shrink-0"
        >
          {isDownloading ? (
            <RiLoader4Line className="animate-spin" aria-hidden />
          ) : (
            <RiDownloadLine aria-hidden />
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

/**
 * Pole wyboru jako przycisk z rolą `checkbox` (etykieta w środku — klik
 * w całość przełącza). Wygląd pola wyboru Finory: kwadrat `border-input`,
 * po zaznaczeniu `bg-primary` z ikoną zaznaczenia.
 */
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
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 p-2 text-left transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-none border transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked ? <RiCheckLine className="size-3.5" /> : null}
      </span>
      <span className="text-foreground text-sm">{label}</span>
    </button>
  );
}
