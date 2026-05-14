'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  resubscribe,
  unsubscribe,
  type EmailCategory,
} from '@/lib/email/preferences';
import { createClient } from '@/lib/supabase/server';

export type EmailPreferenceResult =
  | { success: true }
  | { success: false; error: string };

const TOGGLEABLE: EmailCategory[] = ['product_updates', 'marketing'];

export async function toggleEmailCategoryAction(
  category: EmailCategory,
  subscribed: boolean,
): Promise<EmailPreferenceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  if (!TOGGLEABLE.includes(category)) {
    return {
      success: false,
      error:
        'Emaile transakcyjne (faktury, KSeF, hasła) są wymagane prawnie — nie można ich wyłączyć.',
    };
  }

  try {
    if (subscribed) {
      await resubscribe(user.id, category);
    } else {
      await unsubscribe({
        userId: user.id,
        category,
        source: 'settings_ui',
      });
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'unknown',
    };
  }

  revalidatePath('/settings/notifications');
  return { success: true };
}
