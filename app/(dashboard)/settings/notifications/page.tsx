import { redirect } from 'next/navigation';

import { NotificationsSettings } from '@/components/pwa/notifications-settings';
import {
  getEmailConsents,
  getUnsubscribedCategories,
  type EmailCategory,
} from '@/lib/email/preferences';
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

  const [{ data: subscriptions }, unsubscribed, consents] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    getUnsubscribedCategories(user.id).catch(() => null),
    getEmailConsents(user.id).catch(() => null),
  ]);

  // Przełącznik jest włączony tylko przy zgodzie i bez wypisu — tak samo,
  // jak decyduje wysyłka (`canSendTo`). Bez zgody pokazujemy „wyłączone”.
  const unsubscribedCategories: EmailCategory[] | null =
    unsubscribed && consents
      ? [
          ...new Set<EmailCategory>([
            ...unsubscribed,
            ...(['product_updates', 'marketing'] as const).filter((c) => !consents[c]),
          ]),
        ]
      : null;

  return (
    <div className="space-y-12 max-w-3xl">
      <NotificationsSettings
        subscriptions={
          (subscriptions ?? []) as Tables<'push_subscriptions'>[]
        }
      />
      {unsubscribedCategories === null ? (
        <p role="alert">Nie udało się odczytać ustawień email. Odśwież stronę, zanim je zmienisz.</p>
      ) : (
        <EmailPreferences unsubscribedCategories={unsubscribedCategories} />
      )}
    </div>
  );
}
