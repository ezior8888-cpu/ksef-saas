import { redirect } from 'next/navigation';

import { ImportSourceSelector } from '@/components/onboarding/import-source-selector';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';

/**
 * Krok onboardingu: wybór źródła importu danych po założeniu organizacji.
 *
 * Membership/tenant query przez admin client (deterministyczne, omija RLS) —
 * bez tego zaraz po `createOrganizationAction` zdarzała się sytuacja, gdy
 * RLS odpowiadał `null` ze względu na propagację cache PostgREST → redirect
 * z powrotem na /onboarding (pętla).
 */
export default async function ImportSourcePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) redirect('/onboarding');

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) redirect('/onboarding');

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, nip, ksef_credentials_encrypted')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant) redirect('/onboarding');

  const hasCertificate = !!tenant.ksef_credentials_encrypted;

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-12">
          <ImportSourceSelector
            tenantId={tenantId}
            tenantName={tenant.name ?? ''}
            hasCertificate={hasCertificate}
          />
        </div>
      </div>
    </div>
  );
}
