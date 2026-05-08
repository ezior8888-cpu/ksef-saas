import { redirect } from 'next/navigation';

import { MagicImportForm } from '@/components/onboarding/magic-import-form';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';

export default async function MagicImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  if (!params.tenantId?.trim()) redirect('/onboarding/import-source');

  const tenantId = params.tenantId.trim();
  const activeOrg = await getActiveOrgIdFromCookies();

  if (!activeOrg) redirect('/onboarding');
  if (activeOrg !== tenantId) redirect('/onboarding/import-source');

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) redirect('/onboarding');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-12">
          <MagicImportForm tenantId={tenantId} />
        </div>
      </div>
    </div>
  );
}
