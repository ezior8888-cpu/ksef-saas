import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

import { OnboardingForm } from '@/components/onboarding/form';
import { ACTIVE_ORG_COOKIE, isUuid } from '@/lib/supabase/active-org';
import { createClient } from '@/lib/supabase/server';

interface OnboardingPageProps {
  searchParams: Promise<{
    invite?: string;
    action?: 'new' | 'invite' | 'join';
  }>;
}

/**
 * Strona onboardingu — celowo NIE robi redirectu na "/" gdy user ma cookie:
 * tu wpada zarówno (a) nowy user bez membership (zakłada pierwszą firmę),
 * jak i (b) user z aktywną org który chce dodać kolejną organizację /
 * zaakceptować zaproszenie.
 *
 * Baner „masz aktywną org” tylko przy `?action=new` (celowy flow z pulpitu),
 * żeby pierwszy ekran po rejestracji nie był zasłonięty zielonym paskiem.
 *
 * Brak `redirect()` zapobiega soft-nav loop (URL pasek na /onboarding,
 * RSC zwracający redirect do /, browser wraca na /onboarding ad infinitum).
 */
export default async function OnboardingPage(props: OnboardingPageProps) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const hasActiveOrg = isUuid(activeOrg);
  const showActiveOrgBanner = hasActiveOrg && sp.action === 'new';

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        {showActiveOrgBanner ? (
          <div
            className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 backdrop-blur-xl px-5 py-3 flex items-center justify-between gap-3"
            role="status"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-foreground truncate">
                Masz już aktywną organizację. Możesz dodać kolejną poniżej albo
                wrócić do Dashboard.
              </p>
            </div>
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        ) : null}

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
            {showActiveOrgBanner ? 'Dodaj kolejną organizację' : 'Witaj w FaktFlow'}
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
