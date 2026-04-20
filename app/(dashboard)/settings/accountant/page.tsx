import { redirect } from 'next/navigation';

import {
  AccountantAccessList,
  type AccountantAccessPublicRow,
} from '@/components/settings/accountant-list';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function toPublicAccesses(
  rows: Record<string, unknown>[] | null
): AccountantAccessPublicRow[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    accountant_name: String(r.accountant_name ?? ''),
    accountant_email: String(r.accountant_email ?? ''),
    access_level: String(r.access_level ?? ''),
    expires_at: String(r.expires_at ?? ''),
    use_count: Number(r.use_count ?? 0),
    created_at: String(r.created_at ?? ''),
    revoked_at: r.revoked_at != null ? String(r.revoked_at) : null,
    last_used_at: r.last_used_at != null ? String(r.last_used_at) : null,
  }));
}

export default async function AccountantAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (!userData?.tenant_id) redirect('/onboarding');

  if (userData.role !== 'owner') {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Dostęp dla księgowej</h1>
        <p className="text-sm text-muted-foreground">
          Tylko właściciel konta może tworzyć i cofać linki dostępu.
        </p>
      </div>
    );
  }

  const { data: raw } = await supabase
    .from('accountant_access')
    .select('*')
    .order('created_at', { ascending: false });

  const accesses = toPublicAccesses(raw ?? []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Dostęp dla księgowej</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Generuj ograniczone czasowo linki, przez które biuro rachunkowe pobierze
        Twoje faktury bez potrzeby zakładania konta.
      </p>

      <Card className="p-6">
        <AccountantAccessList accesses={accesses} />
      </Card>
    </div>
  );
}
