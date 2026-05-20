import { Suspense } from 'react';
import { assertDashboardShellAccess } from '@/lib/dashboard-shell-data';
import { signOut } from '../(auth)/login/actions';
import DashboardOrgHeader, {
  OrgSwitcherHeaderSkeleton,
} from '@/app/(dashboard)/_components/dashboard-org-header';
import DashboardVerificationBanner from '@/app/(dashboard)/_components/dashboard-verification-banner';
import { KsefHealthBanner } from '@/app/(dashboard)/_components/ksef-health-banner';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { PrefetchDashboardRoutes } from '@/components/dashboard/prefetch-dashboard-routes';
import { PrefetchExportsRoute } from '@/components/dashboard/exports-route-client';
import { Sidebar } from '@/components/dashboard/sidebar';
import { WelcomeModal } from '@/components/dashboard/welcome-modal';
import { IdleWatcher } from '@/components/auth/idle-watcher';
import { InstallPrompt } from '@/components/pwa/install-prompt-lazy';
import { AnalyticsIdentify } from '@/components/analytics/analytics-identify';
import { SupportWidget } from '@/components/support/support-widget';
import { getAllHelpArticles } from '@/lib/help/articles';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { createClient } from '@/lib/supabase/server';

/**
 * Dashboard layout dla wszystkich chronionych podstron `(dashboard)/...`.
 *
 * Decyzja "czy user może być na tej trasie" jest podejmowana DETERMINISTYCZNIE
 * przez admin client (omija RLS). Bezpieczeństwo:
 * - cookie `ksef.active_org` jest httpOnly (klient nie może go modyfikować
 *   z JS) — sfałszowanie wymaga przejęcia sesji,
 * - dane biznesowe (faktury, expenses, kontrahenci) i tak są chronione przez
 *   RLS na ich tabelach (`get_current_tenant_id() = is_member_of`), więc
 *   nawet sfałszowane cookie nie da dostępu do cudzych danych.
 *
 * Uzasadnienie admin client: query memberships/tenants przez user-context
 * Supabase z RLS jest niedeterministyczne tuż po INSERT przez admin (cache
 * PostgREST, propagacja). Skutkiem była pętla onboarding ↔ /invoices.
 *
 * Płynność: `assertDashboardShellAccess()` — jedno zapytanie memberships+tenants
 * na request (`cache`); nagłówek org i baner w `Suspense` z tym samym cache.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertDashboardShellAccess();

  // Identity dla PostHog (Faza 31 Krok 5). `assertDashboardShellAccess`
  // już potwierdziło sesję i aktywną org — tu tylko czytamy id-ki dla
  // `<AnalyticsIdentify>`. Oba odczyty są lekkie (sesja w cache, cookie).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const activeOrg = await getActiveOrgIdFromCookies();

  // Mapa slug → tytuł dla chipsów cytowań w support widgecie.
  const helpArticleTitles: Record<string, string> = Object.fromEntries(
    getAllHelpArticles().map((a) => [a.slug, a.title]),
  );

  return (
    <div className="ff-dashboard relative flex h-screen min-h-0 overflow-hidden text-[var(--ff-on-surface)]">
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      <Sidebar />

      <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="ff-shell-header sticky top-0 z-40 flex h-[72px] w-full shrink-0 items-center justify-between gap-3 px-4 sm:px-[var(--ff-container-padding)]">
          <div className="flex shrink-0 items-center lg:min-w-0">
            <div className="lg:hidden">
              <MobileNav />
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
            <Suspense fallback={<OrgSwitcherHeaderSkeleton />}>
              <DashboardOrgHeader />
            </Suspense>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Wyloguj"
                className="rounded-full p-2 text-[var(--ff-on-surface)] transition-colors hover:bg-white/5"
              >
                <span className="material-symbols-outlined text-[22px] leading-none">
                  logout
                </span>
              </button>
            </form>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto min-h-0 w-full max-w-[1400px] px-4 pb-10 sm:px-[var(--ff-container-padding)]">
            <Suspense fallback={null}>
              <DashboardVerificationBanner />
            </Suspense>
            <Suspense fallback={null}>
              <KsefHealthBanner />
            </Suspense>
            {children}
          </div>
        </div>
      </main>

      <InstallPrompt />
      <PrefetchDashboardRoutes />
      <PrefetchExportsRoute />
      <IdleWatcher />
      {user && activeOrg && (
        <AnalyticsIdentify
          userId={user.id}
          email={user.email ?? null}
          tenantId={activeOrg}
        />
      )}
      <SupportWidget articleTitles={helpArticleTitles} />
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
    </div>
  );
}
