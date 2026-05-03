'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type { Database, Json } from '@/types/database';

export type ImportJobRow = Database['public']['Tables']['import_jobs']['Row'];

interface ImportJob {
  id: string;
  status: string;
  progress_percent: number;
  progress_message: string | null;
  source: string;
  invoices_found: number;
  invoices_imported: number;
  contractors_created: number;
  contractors_updated: number;
  products_created: number;
  warnings: Json;
  error_message: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Inicjalizacja',
  queued: 'Kolejkowanie',
  parsing: 'Wczytywanie danych',
  extracting: 'Pobieranie faktur',
  deduplicating: 'Analiza danych',
  inserting: 'Zapisywanie',
  completed: 'Gotowe',
  failed: 'Błąd',
  cancelled: 'Anulowano',
};

function normalizeJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    status: row.status,
    progress_percent: row.progress_percent,
    progress_message: row.progress_message,
    source: row.source ?? '',
    invoices_found: row.invoices_found ?? 0,
    invoices_imported: row.invoices_imported ?? 0,
    contractors_created: row.contractors_created ?? 0,
    contractors_updated: row.contractors_updated ?? 0,
    products_created: row.products_created ?? 0,
    warnings: row.warnings,
    error_message: row.status === 'failed' ? row.progress_message : null,
  };
}

interface ImportProgressViewProps {
  initialJob: ImportJobRow;
}

/** Postęp importu: SSR + Supabase Realtime (`import_jobs`). */
export function ImportProgressView({ initialJob }: ImportProgressViewProps) {
  const router = useRouter();
  const [job, setJob] = useState<ImportJob>(() => normalizeJob(initialJob));

  useEffect(() => {
    const supabase = createClient();
    const jobId = initialJob.id;

    const channel = supabase
      .channel(`import-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(normalizeJob(payload.new as ImportJobRow));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialJob.id]);

  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const warningList = Array.isArray(job.warnings)
    ? job.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  if (isCompleted) {
    return (
      <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-12 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tighter-display">
            Import zakończony!
          </h1>
          <p className="text-muted-foreground">
            Twoje konto jest gotowe. Możesz wystawiać faktury od ręki.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-foreground/3 p-4 text-center">
            <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-display font-semibold tracking-tighter-text">
              {job.invoices_imported}
            </p>
            <p className="text-xs text-muted-foreground">Faktury</p>
          </div>
          <div className="rounded-2xl bg-foreground/3 p-4 text-center">
            <Users className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-display font-semibold tracking-tighter-text">
              {job.contractors_created + job.contractors_updated}
            </p>
            <p className="text-xs text-muted-foreground">Kontrahenci</p>
          </div>
          <div className="rounded-2xl bg-foreground/3 p-4 text-center">
            <Package className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-display font-semibold tracking-tighter-text">
              {job.products_created}
            </p>
            <p className="text-xs text-muted-foreground">Produkty</p>
          </div>
        </div>

        {warningList.length > 0 && (
          <div className="rounded-2xl bg-orange-500/5 border border-orange-500/20 p-4">
            <p className="text-xs font-medium text-orange-700 dark:text-orange-400 uppercase tracking-wider mb-2">
              Ostrzeżenia ({warningList.length})
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
              {warningList.slice(0, 5).map((w, i) => (
                <li key={`${w}-${i}`}>• {w}</li>
              ))}
              {warningList.length > 5 && (
                <li className="italic">...i {warningList.length - 5} więcej</li>
              )}
            </ul>
          </div>
        )}

        <Button
          type="button"
          onClick={() => router.push('/invoices')}
          variant="glass-primary"
          size="lg"
          className="w-full"
        >
          Przejdź do faktur
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-glass shadow-glass p-8 space-y-5">
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-tighter-display">
            Import się nie udał
          </h1>
          <p className="text-muted-foreground text-sm">
            {job.error_message ?? job.progress_message ?? 'Wystąpił nieoczekiwany błąd'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => router.push('/onboarding/import-source')}
            variant="glass"
            size="lg"
            className="flex-1"
          >
            Spróbuj ponownie
          </Button>
          <Button
            type="button"
            onClick={() => router.push('/invoices')}
            variant="glass-primary"
            size="lg"
            className="flex-1"
          >
            Pomiń
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-12 space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500 to-blue-500">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-display font-semibold tracking-tighter-display">
          {STATUS_LABELS[job.status] ?? 'Import w toku'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {job.progress_message ?? 'Pracujemy nad Twoimi danymi...'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-apple"
            style={{
              width: `${Math.min(100, Math.max(0, job.progress_percent))}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{job.progress_percent}%</span>
          {job.invoices_found > 0 && <span>{job.invoices_found} faktur znalezionych</span>}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1" aria-hidden />
        Możesz zamknąć tę stronę — skończymy w tle. Otrzymasz email gdy import będzie gotowy.
      </p>
    </div>
  );
}
