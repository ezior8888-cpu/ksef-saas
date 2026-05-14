import { redirect } from 'next/navigation';

import { NotificationsSettings } from '@/components/pwa/notifications-settings';
import { getUnsubscribedCategories } from '@/lib/email/preferences';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

import { EmailPreferences } from './_components/email-preferences';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: subscriptions }, unsubscribedCategories] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    getUnsubscribedCategories(user.id).catch(() => []),
  ]);

  return (
    <div className="space-y-12 max-w-3xl">
      <NotificationsSettings
        subscriptions={
          (subscriptions ?? []) as Tables<'push_subscriptions'>[]
        }
      />
      <EmailPreferences unsubscribedCategories={unsubscribedCategories} />
    </div>
  );
}
