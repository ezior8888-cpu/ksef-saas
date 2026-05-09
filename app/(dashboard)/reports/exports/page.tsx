import { Suspense } from 'react';

import {
  NewExportForm,
  RecentExports,
  type ManualExportJobWithFiles,
} from '@/components/exports/exports-center';
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
    <div className="ff-glass-pane flex min-h-[280px] items-center justify-center rounded-[var(--ff-radius-lg)] p-7 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] lg:p-8">
      Wczytywanie historii eksportów…
    </div>
  );
}

export default function ExportsCenterPage() {
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
        <Suspense fallback={<RecentExportsFallback />}>
          <RecentExportsSection />
        </Suspense>
      </div>
    </div>
  );
}
