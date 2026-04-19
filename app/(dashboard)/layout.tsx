import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { signOut } from '../(auth)/login/actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Defense-in-depth: proxy powinien był przekierować,
  // ale sprawdzamy jeszcze raz na poziomie layoutu.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">KSeF SaaS</h1>
          <nav className="flex gap-4">
            <a href="/invoices" className="text-sm hover:underline">
              Faktury
            </a>
            <a href="/inbox" className="text-sm hover:underline">
              Skrzynka
            </a>
            <a href="/contractors" className="text-sm hover:underline">
              Kontrahenci
            </a>
            <a href="/reports" className="text-sm hover:underline">
              Raporty
            </a>
            <a href="/settings" className="text-sm hover:underline">
              Ustawienia
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Wyloguj
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
