'use server';

import { logAudit } from '@/lib/audit/log';
import { cancelGdprRequest } from '@/lib/gdpr/deletion';

export type GdprCancelState = { outcome: 'idle' | 'canceled' | 'invalid' | 'failed' };

/** Wynik potwierdzenia pochodzi wyłącznie z tej operacji POST, nigdy z query. */
export async function cancelGdprDeletionAction(
  previousState: GdprCancelState,
  formData: FormData,
): Promise<GdprCancelState> {
  void previousState;
  const token = formData.get('token');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { outcome: 'invalid' };
  try {
    const result = await cancelGdprRequest(token, 'user_confirmed_cancel');
    if (!result.ok) return { outcome: 'invalid' };
    await logAudit({
      action: 'gdpr.deletion_canceled', tenantId: null, userId: null,
      metadata: { method: 'email_link_confirmation', request_id: result.requestId },
    });
    return { outcome: 'canceled' };
  } catch {
    return { outcome: 'failed' };
  }
}
