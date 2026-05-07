// lib/push/sender.ts
// Wysyłka push notifications (Web Push Protocol + VAPID)
import webPush from 'web-push';

import { createAdminClient } from '@/lib/supabase/admin';

/** RFC 8292: subject musi być URI typu mailto: lub https: */
function normalizeVapidSubject(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('mailto:') || t.startsWith('https://')) return t;
  if (t.includes('@')) return `mailto:${t}`;
  return t;
}

let vapidConfigured = false;

function configureVapidIfNeeded(): boolean {
  if (vapidConfigured) return true;
  const rawSubject = process.env.VAPID_SUBJECT?.trim();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!rawSubject || !pub || !priv) return false;

  webPush.setVapidDetails(normalizeVapidSubject(rawSubject), pub, priv);
  vapidConfigured = true;
  return true;
}

function webPushStatusCode(err: unknown): number | undefined {
  if (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  ) {
    return (err as { statusCode: number }).statusCode;
  }
  return undefined;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

export type NotificationType =
  | 'invoice_accepted'
  | 'invoice_rejected'
  | 'payment_received'
  | 'cert_expiry'
  | 'inbox_new';

const NOTIFY_COLUMNS: Record<
  NotificationType,
  | 'notify_invoice_accepted'
  | 'notify_invoice_rejected'
  | 'notify_payment_received'
  | 'notify_cert_expiry'
  | 'notify_inbox_new'
> = {
  invoice_accepted: 'notify_invoice_accepted',
  invoice_rejected: 'notify_invoice_rejected',
  payment_received: 'notify_payment_received',
  cert_expiry: 'notify_cert_expiry',
  inbox_new: 'notify_inbox_new',
};

export async function sendPushToUser(
  userId: string,
  type: NotificationType,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configureVapidIfNeeded()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = createAdminClient();
  const notifyCol = NOTIFY_COLUMNS[type];

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq(notifyCol, true);

  if (error || !subscriptions?.length) {
    return { sent: 0, failed: 0 };
  }

  const outcomes = await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          {
            TTL: 24 * 60 * 60,
            urgency: 'normal',
          },
        );

        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
          .eq('id', sub.id);

        return 'sent' as const;
      } catch (err: unknown) {
        const status = webPushStatusCode(err);

        if (status === 410 || status === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        } else {
          await supabase.rpc('increment_push_failed_count', {
            sub_id: sub.id,
          });
        }
        return 'failed' as const;
      }
    }),
  );

  const sent = outcomes.filter((o) => o === 'sent').length;
  const failed = outcomes.filter((o) => o === 'failed').length;
  return { sent, failed };
}

export async function sendPushToTenant(
  tenantId: string,
  type: NotificationType,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', tenantId)
    .eq('status', 'active');

  if (error || !rows?.length) {
    return { sent: 0, failed: 0 };
  }

  const ids = [...new Set(rows.map((r) => r.user_id))];

  const results = await Promise.all(
    ids.map((id) => sendPushToUser(id, type, payload)),
  );

  return results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }),
    { sent: 0, failed: 0 },
  );
}
