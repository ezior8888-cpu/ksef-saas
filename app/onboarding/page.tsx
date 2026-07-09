import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

import { BrandWordmark } from '@/components/brand/brand-wordmark';
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
 *
 * BUG-007: wrapper `ff-dashboard` — panel NIP dostaje DOKŁADNIE ten sam
 * motyw co wnętrze aplikacji (tło --ff-bg, karta .ff-glass-pane, wordmark
 * jak w sidebarze), zamiast osobnego fioletowego „mesh glass".
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
    <div className="ff-dashboard relative flex min-h-screen items-center justify-center overflow-hidden p-4 text-[var(--ff-on-surface)]">
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      <div className="relative z-[1] w-full max-w-2xl space-y-4">
        {showActiveOrgBanner ? (
          <div
            className="ff-glass-pane flex items-center justify-between gap-3 rounded-2xl px-5 py-3"
            role="status"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="truncate text-sm">
                Masz już aktywną organizację. Możesz dodać kolejną poniżej albo
                wrócić do panelu.
              </p>
            </div>
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        ) : null}

        <div className="ff-glass-pane rounded-3xl p-8 lg:p-12">
          <div className="mb-6 flex justify-center">
            <BrandWordmark variant="app" href="/" />
          </div>
          <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight">
            {showActiveOrgBanner ? 'Dodaj kolejną organizację' : 'Witaj w FaktFlow'}
          </h1>
          <p className="mb-8 leading-relaxed text-muted-foreground">
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
