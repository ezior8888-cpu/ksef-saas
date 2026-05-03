import { redirect } from 'next/navigation';

import { ImportSourceSelector } from '@/components/onboarding/import-source-selector';
import { createClient } from '@/lib/supabase/server';

export default async function ImportSourcePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, tenants(name, nip, ksef_credentials_encrypted)')
    .eq('id', user.id)
    .single();

  if (!userData?.tenant_id) {
    redirect('/onboarding');
  }

  const tenantRaw = userData.tenants;
  const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;

  /** Wgrany certyfikat / sekret KSeF (spójnie z ustawieniami KSeF). */
  const hasCertificate = !!tenant?.ksef_credentials_encrypted;

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-12">
          <ImportSourceSelector
            tenantId={userData.tenant_id}
            tenantName={tenant?.name ?? ''}
            hasCertificate={hasCertificate}
          />
        </div>
      </div>
    </div>
  );
}
