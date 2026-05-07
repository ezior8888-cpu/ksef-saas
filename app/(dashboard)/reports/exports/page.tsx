import { ExportsCenter } from '@/components/exports/exports-center';
import { getPageContext } from '@/lib/supabase/page-context';
import type { ManualExportJobWithFiles } from '@/components/exports/exports-center';

export const dynamic = 'force-dynamic';

export default async function ExportsCenterPage() {
  const { supabase, tenantId } = await getPageContext();

  // Historia ostatnich 20 manualnych eksportów (RLS + jawny filtr tenanta).
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

  return (
    <ExportsCenter recentJobs={(recentJobs ?? []) as ManualExportJobWithFiles[]} />
  );
}
