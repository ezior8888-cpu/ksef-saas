'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action wywoływana z `IdleWatcher` po 60 min idle.
 *
 * Dlaczego osobna od `signOut`:
 *   - logujemy `auth.logout` z `metadata.reason: 'inactivity'` — w audycie
 *     widać, że user nie kliknął "Wyloguj" świadomie,
 *   - redirect leci do `/login?success=session_expired` z komunikatem
 *     "wylogowaliśmy Cię dla bezpieczeństwa", a nie zwykłe `/login`.
 */
export async function forceSignOutInactive(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('last_active_tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    await logAudit({
      action: 'auth.logout',
      tenantId: row?.last_active_tenant_id ?? null,
      userId: user.id,
      metadata: { reason: 'inactivity_timeout' },
    });
  }

  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login?success=session_expired');
}
