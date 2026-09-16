'use server';

import { revalidatePath } from 'next/cache';
import { getVerifiedUserContext } from '@/lib/auth/verified-user';
import { resubscribe, unsubscribe, type EmailCategory } from '@/lib/email/preferences';

export type EmailPreferenceResult =
  | { success: true }
  | { success: false; error: string };

const TOGGLEABLE: EmailCategory[] = ['product_updates', 'marketing'];

export async function toggleEmailCategoryAction(
  category: EmailCategory,
  subscribed: boolean,
): Promise<EmailPreferenceResult> {
  const context = await getVerifiedUserContext();
  if (!context.ok) return { success: false, error: context.error };
  if (!TOGGLEABLE.includes(category) || typeof subscribed !== 'boolean') {
    return { success: false, error: 'Nieprawidłowe ustawienie powiadomień.' };
  }
  try {
    if (subscribed) {
      await resubscribe(context.user.id, category);
    } else {
      await unsubscribe({ userId: context.user.id, category, source: 'settings_ui' });
    }
  } catch {
    return { success: false, error: 'Nie udało się zapisać ustawienia. Spróbuj ponownie.' };
  }
  revalidatePath('/settings/notifications');
  return { success: true };
}
