/**
 * Email preferences API (Faza 26).
 *
 * Strategia: per user × per kategoria opt-out. Brak wiersza w
 * `email_preferences` = subscribed. Wiersz z `unsubscribed_at` =
 * user wyłączył tę kategorię.
 *
 * UWAGA: `transactional` kategoria jest SERVICE-CRITICAL. Nawet jeśli
 * user "wyłączy" przez settings UI, transactional emaile (KSeF accepted,
 * password reset, payment failed) NADAL będą wysyłane — to wymóg prawny
 * + bez tego user nie wie że jego faktury padają. Hard bounce / complaint
 * to jedyne ścieżki które realnie blokują transactional (Resend i tak
 * by je rejectował).
 */

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Lokalny typ — `email_category_enum` powstaje w migracji 00049 i nie jest
 * jeszcze w `types/database.ts` (pre-regeneracja). Po `supabase gen types`
 * można podmienić na `Database['public']['Enums']['email_category_enum']`.
 */
export type EmailCategory = 'transactional' | 'product_updates' | 'marketing';

export const ALL_CATEGORIES: EmailCategory[] = [
  'transactional',
  'product_updates',
  'marketing',
];

export interface UnsubscribeInput {
  userId: string;
  category: EmailCategory;
  source: 'one_click' | 'settings_ui' | 'hard_bounce_auto' | 'complaint_auto' | 'admin';
  reason?: string;
}

/**
 * Czy user jest zapisany na daną kategorię. Brak wiersza = subscribed.
 */
export async function isSubscribed(
  userId: string,
  category: EmailCategory,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('email_preferences')
    .select('id')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();
  return !data;
}

/**
 * Czy email adres jest dezaktywowany przez bounce/complaint. Lookup po
 * `email_bounces` — hard bounce / complaint blokuje wszystkie emails
 * (włącznie z transactional, żeby nie zniszczyć reputacji domeny).
 */
export async function isEmailBlocked(email: string): Promise<{
  blocked: boolean;
  reason?: 'hard_bounce' | 'complaint';
}> {
  const supabase = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data } = await supabase
    .from('email_bounces')
    .select('bounce_type')
    .eq('email', normalizedEmail)
    .in('bounce_type', ['hard', 'complaint'])
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { blocked: false };
  return {
    blocked: true,
    reason: data.bounce_type === 'hard' ? 'hard_bounce' : 'complaint',
  };
}

/**
 * Unsubscribe user × kategoria. Idempotent — powtórny call nie crashuje.
 *
 * `source` jest WAŻNY dla audit: pozwala odróżnić "user kliknął w mailu"
 * od "Gmail oznaczył jako spam = complaint" od "admin ręcznie zablokował".
 */
export async function unsubscribe(input: UnsubscribeInput): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('email_preferences').upsert(
    {
      user_id: input.userId,
      category: input.category,
      source: input.source,
      reason: input.reason ?? null,
      unsubscribed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category', ignoreDuplicates: false },
  );
}

/**
 * Resubscribe — usuwa wiersz z `email_preferences` (czyli wraca do
 * domyślnego subscribed). UI w `/settings/notifications` używa tego.
 */
export async function resubscribe(
  userId: string,
  category: EmailCategory,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('email_preferences')
    .delete()
    .eq('user_id', userId)
    .eq('category', category);
}

/**
 * Pobiera wszystkie wyłączone kategorie dla user'a. Używane przez
 * `/settings/notifications` UI żeby zaznaczyć checkboxy.
 */
export async function getUnsubscribedCategories(
  userId: string,
): Promise<EmailCategory[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('email_preferences')
    .select('category')
    .eq('user_id', userId);
  return (data ?? []).map((r) => r.category as EmailCategory);
}

/**
 * Helper przed wysyłką email'a: czy MOŻEMY ten email wysłać?
 *
 * Reguły:
 *   1. Hard bounce / complaint → NIE wysyłamy nic (nawet transactional)
 *   2. User opt-out + kategoria 'transactional' → wysyłamy mimo wszystko
 *      (service-critical)
 *   3. User opt-out + product_updates/marketing → NIE wysyłamy
 *   4. Brak wiersza = subscribed → wysyłamy
 */
export async function canSendTo(
  email: string,
  userId: string | null,
  category: EmailCategory,
): Promise<{ ok: boolean; reason?: string }> {
  // Layer 1: bounce check (zawsze).
  const bounce = await isEmailBlocked(email);
  if (bounce.blocked) {
    return { ok: false, reason: bounce.reason };
  }

  // Layer 2: transactional ZAWSZE OK (service-critical).
  if (category === 'transactional') return { ok: true };

  // Layer 3: brak userId (np. preview link bez user contextu) = OK.
  if (!userId) return { ok: true };

  // Layer 4: user opt-out check.
  const subscribed = await isSubscribed(userId, category);
  if (!subscribed) {
    return { ok: false, reason: 'user_unsubscribed' };
  }

  return { ok: true };
}
