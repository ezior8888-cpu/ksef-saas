import Link from 'next/link';
import {
  RiBox3Line,
  RiBuilding2Line,
  RiCalendarCheckLine,
  RiContactsBook3Line,
  RiFileList3Line,
} from '@remixicon/react';

import StatsCards, { type StatItem } from '@/components/dashboard/stats-cards';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPlInt } from '@/lib/format/pl';
import { cn } from '@/lib/utils';

import { ImportHistory } from './import-history';
import {
  formatWarsawDay,
  IMPORT_HISTORY_LIMIT,
  sourceLabel,
  summarizeImports,
  type ImportHistoryJob,
} from './import-model';
import { ImportSourceGrid } from './import-source-grid';

/**
 * Centrum importu — ekran `/import-danych` (poprawka Bartosza 22.10.2026:
 * import danych w stylu Finory). Układ Accounts z Finory: nagłówek z podpisem,
 * kafle z liczbami, siatka kart źródeł, a na końcu karta z historią
 * importów sięgająca stopki (`ff-page-fill`).
 *
 * Ten plik tylko składa ekran (bez `'use client'` i bez zapytań): strona
 * podaje dane z `tenants` i `import_jobs`, a lokalny podgląd — przykładowe.
 *
 * Kafle pokazujemy dopiero, gdy jest jakikolwiek import — przy pierwszej
 * wizycie rząd zer niczego nie mówi, a pusta historia ma trzy kroki „jak to
 * działa”. Gdy historii nie da się wczytać, kafli nie ma wcale (nie znamy
 * liczb), a karta historii mówi o błędzie i daje „Odśwież”.
 */

export interface ImportCenterProps {
  tenantId: string;
  tenantName?: string | null;
  nip?: string | null;
  hasCertificate: boolean;
  /** `null` — historii nie udało się wczytać. */
  jobs: ImportHistoryJob[] | null;
}

export function ImportHeader({ tenantName, nip }: { tenantName?: string | null; nip?: string | null }) {
  return (
    <div className="flex justify-between gap-3 max-sm:flex-col sm:items-center">
      <div>
        <h1 className="text-2xl font-semibold">Import danych</h1>
        <p className="text-muted-foreground text-sm">Przenieś historię faktur z KSeF albo z poprzedniego programu.</p>
      </div>
      {nip ? (
        // Do której firmy trafią faktury — ważne przy kilku firmach na jednym koncie.
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <RiBuilding2Line className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {tenantName ? <span className="text-foreground font-medium">{tenantName}</span> : null}
            {tenantName ? ' · ' : null}NIP <span className="font-mono">{nip}</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function importStats(jobs: readonly ImportHistoryJob[]): StatItem[] {
  const summary = summarizeImports(jobs);
  const partialNote = summary.partial ? `z ostatnich ${IMPORT_HISTORY_LIMIT} importów` : undefined;
  const last = summary.lastCompleted;
  return [
    { label: 'Zaimportowane faktury', value: formatPlInt(summary.invoices), icon: RiFileList3Line, note: partialNote },
    { label: 'Nowi kontrahenci', value: formatPlInt(summary.contractors), icon: RiContactsBook3Line, note: partialNote },
    { label: 'Nowe produkty', value: formatPlInt(summary.products), icon: RiBox3Line, note: partialNote },
    {
      label: 'Ostatni import',
      value: last ? formatWarsawDay(last.completed_at ?? last.created_at) : '—',
      icon: RiCalendarCheckLine,
      note: last ? sourceLabel(last.source) : 'jeszcze żaden się nie zakończył',
    },
  ];
}

function HistoryError() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4">
      <h2 className="text-base font-semibold">Historia importów</h2>
      <Alert variant="destructive">
        <AlertTitle>Nie udało się wczytać historii</AlertTitle>
        <AlertDescription>Import możesz uruchomić mimo to.</AlertDescription>
        <AlertAction>
          {/* `text-foreground`: bez tego przycisk dziedziczy czerwień alertu. */}
          <Link href="/import-danych" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-foreground')}>
            Odśwież
          </Link>
        </AlertAction>
      </Alert>
    </div>
  );
}

export function ImportCenter({ tenantId, tenantName, nip, hasCertificate, jobs }: ImportCenterProps) {
  return (
    <div className="ff-page-fill flex flex-col gap-6">
      <ImportHeader tenantName={tenantName} nip={nip} />
      {jobs && jobs.length > 0 ? <StatsCards stats={importStats(jobs)} /> : null}
      <ImportSourceGrid tenantId={tenantId} hasCertificate={hasCertificate} />
      <Card className="flex-1">{jobs ? <ImportHistory jobs={jobs} /> : <HistoryError />}</Card>
    </div>
  );
}
