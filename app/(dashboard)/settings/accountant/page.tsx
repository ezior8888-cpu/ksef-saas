import { redirect } from 'next/navigation';

import {
  AccountantAccessList,
  type AccountantAccessPublicRow,
} from '@/components/settings/accountant-list';
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
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Dostęp dla księgowej
          </h1>
          <p className="mt-2 text-muted-foreground">
            Tylko właściciel konta może tworzyć i cofać linki dostępu.
          </p>
        </div>
      </div>
    );
  }

  const { data: raw } = await supabase
    .from('accountant_access')
    .select('*')
    .order('created_at', { ascending: false });

  const accesses = toPublicAccesses(raw ?? []);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Dostęp dla księgowej
        </h1>
        <p className="mt-2 text-muted-foreground">
          Generuj ograniczone czasowo linki do udostępnienia faktur biuru rachunkowemu
        </p>
      </div>

      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6 lg:p-8">
        <AccountantAccessList accesses={accesses} />
      </div>
    </div>
  );
}
