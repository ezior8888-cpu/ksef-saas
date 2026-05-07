import Image from 'next/image';
import { redirect } from 'next/navigation';

import { OnboardingForm } from '@/components/onboarding/form';
import { createClient } from '@/lib/supabase/server';

interface OnboardingPageProps {
  searchParams: Promise<{
    invite?: string;
    action?: 'new' | 'invite' | 'join';
  }>;
}

export default async function OnboardingPage(props: OnboardingPageProps) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Multi-org: jeśli user ma już aktywne membership i nie chce explicitnie
  // dodać kolejnej organizacji (`?action=new`), wracamy na dashboard.
  if (sp.action !== 'new') {
    const { data: existing } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    if (existing && existing.length > 0 && !sp.invite) {
      redirect('/');
    }
  }

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-3xl shadow-[0_16px_48px_0_rgba(31,38,135,0.12)] p-8 lg:p-12">
          <div className="mb-5 flex justify-center">
            <Image
              src="/brand/faktflow-logo.png"
              alt="FaktFlow"
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl object-contain bg-foreground/5 shadow-glass-sm dark:bg-white/10"
              priority
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3 text-center">
            Witaj w FaktFlow
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Wybierz, jak chcesz zacząć: załóż nową organizację, akceptuj
            zaproszenie albo poproś o dostęp do firmy, która już używa
            FaktFlow.
          </p>
          <OnboardingForm initialInviteToken={sp.invite} />
        </div>
      </div>
    </div>
  );
}
