import { redirect } from 'next/navigation';

import { ImportProgressView } from '@/components/onboarding/import-progress-view';
import { requireVerifiedUserForPage } from '@/lib/auth/verified-user';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';

interface Props {
  params: Promise<{ jobId: string }>;
}

export default async function ProgressPage({ params }: Props) {
  const { jobId } = await params;
  const { supabase } = await requireVerifiedUserForPage('/onboarding/progress/' + encodeURIComponent(jobId));
  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) redirect('/onboarding');

  const { data: job } = await supabase.from('import_jobs').select('*').eq('id', jobId).eq('tenant_id', tenantId).single();

  if (!job) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <ImportProgressView initialJob={job} />
      </div>
    </div>
  );
}
