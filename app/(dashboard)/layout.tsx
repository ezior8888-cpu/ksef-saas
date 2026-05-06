import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '../(auth)/login/actions';
import { MobileNav } from '@/components/dashboard/mobile-nav';
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

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, tenants(name, nip)')
    .eq('id', user.id)
    .single();

  if (!userData?.tenant_id) {
    redirect('/onboarding');
  }

  const tenant = Array.isArray(userData.tenants)
    ? userData.tenants[0]
    : userData.tenants;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-mesh-surface">
      <header className="sticky top-0 z-40 bg-white/55 dark:bg-[rgba(15,10,30,0.55)] backdrop-blur-glass-lg border-b border-white/55 dark:border-white/10 shadow-glass-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileNav />
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center font-bold text-sm shadow-glass-sm">
                K
              </div>
              <span className="font-semibold tracking-tight truncate">
                KSeF SaaS
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">
                {tenant?.name ?? 'Bez nazwy'}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                NIP: {tenant?.nip}
              </p>
            </div>
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
