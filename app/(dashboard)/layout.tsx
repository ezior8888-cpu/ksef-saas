import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, isUuid } from '@/lib/supabase/active-org';
import { listMyOrganizations } from '@/app/actions/organizations';
import { signOut } from '../(auth)/login/actions';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { OrgSwitcher } from '@/components/dashboard/org-switcher';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { Button } from '@/components/ui/button';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Cookie aktywnej org jest ustawiane przez middleware (bootstrap z
  // memberships) — jeśli mimo to brak, znaczy że user nie ma żadnego
  // aktywnego membership. Wysyłamy do onboardingu.
  const cookieStore = await cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!isUuid(activeOrg)) {
    redirect('/onboarding');
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, nip')
    .eq('id', activeOrg)
    .maybeSingle();

  if (!tenant) {
    // Cookie wskazuje na nieistniejącą / niedostępną org — bezpieczny redirect.
    redirect('/onboarding');
  }

  const memberships = await listMyOrganizations();

  return (
    <div className="flex h-screen min-h-0 flex-col bg-mesh-surface">
      <header className="sticky top-0 z-40 bg-white/55 dark:bg-[rgba(15,10,30,0.55)] backdrop-blur-glass-lg border-b border-white/55 dark:border-white/10 shadow-glass-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileNav />
            <Link href="/reports" className="flex min-w-0 items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center font-bold text-sm shadow-glass-sm">
                F
              </div>
              <span className="font-semibold tracking-tight truncate">
                FaktFlow
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <OrgSwitcher
              memberships={memberships}
              activeOrgId={activeOrg}
              activeName={tenant.name}
              activeNip={tenant.nip}
            />
            <ThemeToggle />
            <form action={signOut}>
              <Button
                variant="ghost"
                size="icon"
                type="submit"
                aria-label="Wyloguj"
                className="rounded-full hover:bg-foreground/5"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-auto bg-transparent">
          <div className="max-w-7xl mx-auto p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
      <InstallPrompt />
    </div>
  );
}
