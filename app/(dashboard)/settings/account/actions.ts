'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit/log';
import { reauthenticateWithPassword } from '@/lib/auth/reauth';
import { sendGdprDeletionScheduledEmail } from '@/lib/email/send';
import { createGdprRequest } from '@/lib/gdpr/deletion';
import { createClient } from '@/lib/supabase/server';

export type GdprDeletionResult =
  | {
      ok: true;
      scheduledFor: string;
    }
  | {
      ok: false;
      error:
        | 'not_authenticated'
        | 'invalid_password'
        | 'no_email'
        | 'request_failed';
    };

/**
 * Server Action: zgłoszenie GDPR right-to-be-forgotten.
 *
 * Wymaga re-auth hasłem — nie chcemy żeby skradzione cookie spowodowało
 * przypadkowe zniszczenie konta. Po sukcesie wysyła email z linkiem cancel
 * (14 dni cooling-off).
 */
export async function requestGdprDeletionAction(
  formData: FormData,
): Promise<GdprDeletionResult> {
  const password = String(formData.get('current_password') ?? '');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };
  if (!user.email) return { ok: false, error: 'no_email' };

  const reauth = await reauthenticateWithPassword(password);
  if (!reauth.ok) return { ok: false, error: 'invalid_password' };

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    null;
  const userAgent = headersList.get('user-agent') ?? null;
  const origin =
    headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  try {
    const created = await createGdprRequest({
      userId: user.id,
      userEmail: user.email,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    const cancelUrl = `${origin}/gdpr/cancel?token=${created.cancelToken}`;
    const scheduledForFmt = created.scheduledFor.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    await sendGdprDeletionScheduledEmail({
      userEmail: user.email,
      scheduledFor: scheduledForFmt,
      cancelUrl,
    });

    await logAudit({
      action: 'gdpr.deletion_requested',
      tenantId: null,
      userId: user.id,
      metadata: {
        request_id: created.id,
        scheduled_for: created.scheduledFor.toISOString(),
      },
    });

    revalidatePath('/settings/account');

    return { ok: true, scheduledFor: scheduledForFmt };
  } catch (err) {
    console.error('[requestGdprDeletionAction]', err);
    return { ok: false, error: 'request_failed' };
  }
}
