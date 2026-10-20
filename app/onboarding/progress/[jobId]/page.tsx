import { redirect } from 'next/navigation';

import { AuthSplitLayout } from '@/components/auth/finora/auth-split-layout';
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

  // Plan Finora P15 (E10b): układ logowania Finory zamiast pustej ramki.
  return (
    <AuthSplitLayout
      panelTitle="Importujemy Twoje dane"
      panelText="Postęp odświeża się sam. Możesz zamknąć stronę — skończymy w tle i wyślemy e‑mail, gdy import będzie gotowy."
    >
      <ImportProgressView initialJob={job} />
    </AuthSplitLayout>
  );
}
