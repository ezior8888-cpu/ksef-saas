import { redirect } from 'next/navigation';

import { ImportProgressView } from '@/components/onboarding/import-progress-view';
import { createClient } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ jobId: string }>;
}

export default async function ProgressPage({ params }: Props) {
  const { jobId } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase.from('import_jobs').select('*').eq('id', jobId).single();

  if (!job) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <ImportProgressView initialJob={job} />
      </div>
    </div>
  );
}
