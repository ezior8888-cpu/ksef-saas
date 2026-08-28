/**
 * Wykonawca ponagleń (krok 23 planu) — WYŁĄCZNIE ta część, która wysyła.
 *
 * Osobny plik od `payment-chase.ts`, bo tamten importuje cron budujący
 * propozycje. Gdyby wysyłka siedziała w tym samym module, w grafie
 * zależności powstałaby ścieżka „cron → wysyłka na zewnątrz" — i test
 * architektoniczny miałby rację, zgłaszając ją jako naruszenie.
 *
 * Ten plik importuje wyłącznie rejestr funkcji agenta, ładowany przez
 * workera i przez akcje serwerowe.
 */

import {
  evaluateChaseSafety,
} from '@/lib/flo/functions/payment-chase';
import { registerFloHandler } from '@/lib/flo/handlers';
import { remindersSendRequested } from '@/lib/inngest/client';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';

// ═══════════════════════════════════════════════════════════════
// Wykonawca
// ═══════════════════════════════════════════════════════════════

interface ChaseClient {
  from: (table: 'payments' | 'payment_reminders' | 'email_bounces') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Wysyłka ponaglenia.
 *
 * Wiersz w `payment_reminders` powstaje DOPIERO TUTAJ — czyli po zgodzie
 * człowieka. Od kroku 6 cron go nie tworzy, bo kolejka wpisów „pending",
 * których nikt nigdy nie wyśle, to śmieci w bazie i fałszywy obraz w raportach.
 *
 * Żeton zgody idzie dalej do zadania wysyłki. To jest ten sam identyfikator,
 * który wykonawca zużył przed wywołaniem tego kodu — dowód, że wysyłka ma
 * pokrycie w decyzji człowieka.
 */
registerFloHandler('payment.chase', async (ctx) => {
  const payload = ctx.proposal.payload ?? {};
  const invoiceId = payload.invoiceId;
  const stage = payload.stage;

  if (typeof invoiceId !== 'string' || typeof stage !== 'string') {
    throw new Error('Propozycja ponaglenia bez kompletu danych');
  }

  const client = createAdminClient() as unknown as ChaseClient;

  // ── Okno bezpieczeństwa ──────────────────────────────────────
  //
  // Sprawdzamy wpłaty od kontrahenta, nie tylko do tej faktury: przelew
  // bywa zaksięgowany na innej pozycji albo jeszcze niedopasowany, a mimo
  // to znaczy „ten człowiek właśnie zapłacił".
  const recent = await client
    .from('payments')
    .select('paid_at')
    .eq('invoice_id', invoiceId)
    .order('paid_at', { ascending: false })
    .limit(1);

  if (recent.error) throw new Error(recent.error.message);

  const lastPaymentAt =
    typeof recent.data?.[0]?.paid_at === 'string'
      ? (recent.data[0].paid_at as string)
      : null;

  const facts = (payload.facts ?? {}) as Record<string, unknown>;
  const outstanding =
    Number(facts.grossTotal ?? 0) - Number(facts.paidAmount ?? 0);

  const safety = evaluateChaseSafety({
    outstanding,
    lastPaymentFromContractorAt: lastPaymentAt,
    remindersPaused: facts.remindersPaused === 1,
    now: new Date(),
  });

  if (!safety.ok) {
    // Blokada w handlerze, a nie po drodze: to ostatni moment, w którym
    // da się zatrzymać coś, czego nie da się cofnąć.
    throw new Error(safety.message);
  }

  // ── Wiersz przypomnienia dopiero po zgodzie ──────────────────
  const created = await client
    .from('payment_reminders')
    .insert({
      tenant_id: ctx.proposal.tenant_id,
      invoice_id: invoiceId,
      stage,
      channel: 'email',
      scheduled_for: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (created.error) throw new Error(created.error.message);
  const reminderId = created.data?.id;
  if (!reminderId) throw new Error('Nie udało się zapisać przypomnienia');

  // ── Wysyłka z żetonem zgody ──────────────────────────────────
  await sendJobEvent(
    remindersSendRequested.create({
      reminderId,
      approvalId: ctx.approvalId,
    }),
  );

  return {
    summary: `ponaglenie ${stage} przekazane do wysyłki`,
    details: { invoiceId, reminderId, stage },
  };
});
