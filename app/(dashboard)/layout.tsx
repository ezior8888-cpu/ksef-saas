import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '../(auth)/login/actions';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Button } from '@/components/ui/button';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Defense-in-depth: middleware powinien był przekierować niezalogowanych,
  // ale dublujemy check tutaj (layout to drugi bastion).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Dociągamy tenanta w jednym query (join po FK users.tenant_id -> tenants.id).
  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, tenants(name, nip)')
    .eq('id', user.id)
    .single();

  // Brak tenanta = user nie przeszedł onboardingu (Faza 6.3 doda ten ekran).
  if (!userData?.tenant_id) {
    redirect('/onboarding');
  }

  // Supabase PostgREST zwraca `tenants` jako obiekt przy 1:1 join,
  // ale typy z generatora czasem dają array. Normalizujemy defensywnie.
  const tenant = Array.isArray(userData.tenants)
    ? userData.tenants[0]
    : userData.tenants;

  const { data: sampleInvoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('direction', 'outgoing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <Link href="/invoices" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-black text-white flex items-center justify-center font-bold text-sm">
            K
          </div>
          <span className="font-semibold">KSeF SaaS</span>
        </Link>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium">{tenant?.name ?? 'Bez nazwy'}</p>
            <p className="text-xs text-gray-500">NIP: {tenant?.nip}</p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Wyloguj">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar sampleInvoiceId={sampleInvoice?.id ?? null} />
        <main className="flex-1 overflow-auto bg-white p-6">{children}</main>
      </div>
    </div>
  );
}
