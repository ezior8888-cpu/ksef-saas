'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  deviceName?: string;
}

export async function subscribePushAction(input: SubscribeInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Brak autoryzacji' };

  // `users.id` = auth.uid() (PK, nie kolumna `user_id`)
  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!userData?.tenant_id) {
    return { success: false as const, error: 'Brak tenanta' };
  }

  // Upsert po endpoint (UNIQUE) — ten sam browser odświeża klucze
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      tenant_id: userData.tenant_id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent,
      device_type: input.deviceType,
      device_name: input.deviceName,
      is_active: true,
      failed_count: 0,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    return { success: false as const, error: error.message };
  }

  revalidatePath('/settings/notifications');
  return { success: true as const };
}

export async function unsubscribePushAction(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const };

  await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  revalidatePath('/settings/notifications');
  return { success: true as const };
}

export async function updatePushPreferencesAction(
  subscriptionId: string,
  preferences: Partial<{
    notify_invoice_accepted: boolean;
    notify_invoice_rejected: boolean;
    notify_payment_received: boolean;
    notify_cert_expiry: boolean;
    notify_inbox_new: boolean;
  }>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const };

  await supabase
    .from('push_subscriptions')
    .update(preferences)
    .eq('id', subscriptionId)
    .eq('user_id', user.id);

  revalidatePath('/settings/notifications');
  return { success: true as const };
}
