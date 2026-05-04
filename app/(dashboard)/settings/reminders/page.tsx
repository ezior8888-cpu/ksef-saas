import { redirect } from 'next/navigation';

import { ReminderSettingsForm } from '@/components/reminders/reminder-settings-form';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReminderSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userTenant } = await supabase
    .from('users')
    .select('tenant_id, role, tenants(name)')
    .eq('id', user.id)
    .single();

  if (!userTenant?.tenant_id) redirect('/settings');

  if (userTenant.role !== 'owner') redirect('/settings');

  const { data: settings } = await supabase
    .from('reminder_settings')
    .select('*')
    .eq('tenant_id', userTenant.tenant_id)
    .maybeSingle();

  const tenantName =
    (Array.isArray(userTenant.tenants)
      ? userTenant.tenants[0]
      : userTenant.tenants
    )?.name ?? '';

  return (
    <div className="max-w-3xl">
      <ReminderSettingsForm initialSettings={settings} tenantName={tenantName} />
    </div>
  );
}
