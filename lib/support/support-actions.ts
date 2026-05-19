'use server';

import { sendSlackAlert } from '@/lib/alerts/slack';
import { createClient } from '@/lib/supabase/server';
import { getOwnedConversation, updateConversation } from './conversations';

/**
 * Server Actions dla widgetu support (Faza 30 Krok 7).
 * Każda sprawdza ownership konwersacji przed zapisem.
 */

export type SupportActionResult = { ok: boolean };

/**
 * CSAT — użytkownik ocenia konwersację 👍/👎. Negatywna ocena trafia
 * dodatkowo na Slack, żeby zespół mógł przejrzeć, co poszło nie tak.
 */
export async function submitCsatAction(
  conversationId: string,
  positive: boolean,
): Promise<SupportActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const conv = await getOwnedConversation(conversationId, user.id);
  if (!conv) return { ok: false };

  await updateConversation(conversationId, { csat_positive: positive });

  if (!positive) {
    await sendSlackAlert({
      channel: 'bugs',
      text: '👎 Negatywna ocena rozmowy z AI support — warto przejrzeć.',
      context: {
        conversation_id: conversationId,
        category: conv.category ?? 'unknown',
      },
    });
  }

  return { ok: true };
}

/**
 * Ręczna eskalacja — użytkownik klika „Połącz z człowiekiem".
 * Oznacza konwersację jako `escalated` i alarmuje zespół.
 */
export async function escalateConversationAction(
  conversationId: string,
): Promise<SupportActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const conv = await getOwnedConversation(conversationId, user.id);
  if (!conv) return { ok: false };

  // Już eskalowane — nie duplikujemy alertu.
  if (conv.status === 'escalated') return { ok: true };

  await updateConversation(conversationId, {
    status: 'escalated',
    escalated_at: new Date().toISOString(),
    escalation_reason: 'user_requested',
  });

  await sendSlackAlert({
    channel: 'bugs',
    text: '🙋 Użytkownik poprosił o kontakt z człowiekiem (support).',
    context: {
      conversation_id: conversationId,
      user_email: user.email ?? 'unknown',
      category: conv.category ?? 'unknown',
    },
  });

  return { ok: true };
}
