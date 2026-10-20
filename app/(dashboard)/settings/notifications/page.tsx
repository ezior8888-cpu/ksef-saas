import { redirect } from 'next/navigation';

import { NotificationsSettings } from '@/components/pwa/notifications-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { getUnsubscribedCategories } from '@/lib/email/preferences';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

import { EmailPreferences } from './_components/email-preferences';

export const dynamic = 'force-dynamic';

/**
 * Zakładka „Powiadomienia” = Notifications z Finory (`views/settings/
 * notifications`): u góry push na urządzeniach, pod separatorem e-maile
 * (w Finorze w tym miejscu stoją „Quiet hours”).
 */
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
    getUnsubscribedCategories(user.id).catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <NotificationsSettings
        subscriptions={
          (subscriptions ?? []) as Tables<'push_subscriptions'>[]
        }
      />

      <Separator />

      {unsubscribedCategories === null ? (
        <Alert variant="destructive">
          <AlertDescription>Nie udało się odczytać ustawień email. Odśwież stronę, zanim je zmienisz.</AlertDescription>
        </Alert>
      ) : (
        <EmailPreferences unsubscribedCategories={unsubscribedCategories} />
      )}
    </div>
  );
}
