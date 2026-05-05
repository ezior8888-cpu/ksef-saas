import { redirect } from 'next/navigation';

import { NotificationsSettings } from '@/components/pwa/notifications-settings';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <NotificationsSettings
      subscriptions={
        (subscriptions ?? []) as Tables<'push_subscriptions'>[]
      }
    />
  );
}
