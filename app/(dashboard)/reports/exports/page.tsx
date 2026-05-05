import { redirect } from 'next/navigation';

import { ExportsCenter } from '@/components/exports/exports-center';
import { createClient } from '@/lib/supabase/server';
import type { ManualExportJobWithFiles } from '@/components/exports/exports-center';

export const dynamic = 'force-dynamic';

export default async function ExportsCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userTenant } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userTenant?.tenant_id) redirect('/onboarding');

  const tenantId = userTenant.tenant_id;

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
