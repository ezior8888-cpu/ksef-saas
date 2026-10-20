import { redirect } from 'next/navigation';

import { AuthSplitLayout } from '@/components/auth/finora/auth-split-layout';
import { MagicImportForm } from '@/components/onboarding/magic-import-form';
import { createAdminClient } from '@/lib/supabase/server';
import { requireVerifiedUserForPage } from '@/lib/auth/verified-user';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';

export default async function MagicImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const params = await searchParams;
  const { user } = await requireVerifiedUserForPage('/onboarding/magic-import' + (params.tenantId ? '?tenantId=' + encodeURIComponent(params.tenantId) : ''));
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

  // Plan Finora P15 (E10b): układ logowania Finory zamiast szkła.
  return (
    <AuthSplitLayout
      panelTitle="Magiczny import z KSeF"
      panelText="Pobieramy faktury z wybranego okresu i budujemy z nich katalog kontrahentów i produktów."
    >
      <MagicImportForm tenantId={tenantId} />
    </AuthSplitLayout>
  );
}
