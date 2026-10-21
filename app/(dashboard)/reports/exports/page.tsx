import { Suspense } from 'react';

import {
  ExportsHeading,
  NewExportForm,
  RecentExports,
  type ManualExportJobWithFiles,
} from '@/components/exports/exports-center';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

async function RecentExportsSection() {
  const { supabase, tenantId } = await getPageContext();

  const { data: recentJobs } = await supabase
    .from('export_jobs')
    .select(
      `
      *,
      export_files(id, filename, format, size_bytes, download_count)
    `,
    )
    .eq('tenant_id', tenantId)
    .eq('trigger_source', 'manual')
    .order('created_at', { ascending: false })
    .limit(20);

  return <RecentExports jobs={(recentJobs ?? []) as ManualExportJobWithFiles[]} />;
}

function RecentExportsFallback() {
  return (
    <Card className="shadow-none" aria-busy="true">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Historia eksportów</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">Wczytywanie historii eksportów…</p>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

/** Eksport (P13): karty formatów w stylu Accounts Finory; logika bez zmian. */
export default function ExportsCenterPage() {
  return (
    <div className="space-y-6 pb-10">
      <ExportsHeading />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NewExportForm />
        <Suspense fallback={<RecentExportsFallback />}>
          <RecentExportsSection />
        </Suspense>
      </div>
    </div>
  );
}
