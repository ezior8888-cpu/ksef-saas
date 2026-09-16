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

  if (typeof invoiceId !== 'string' ||
      (stage !== 'stage_1' && stage !== 'stage_2' && stage !== 'stage_3' && stage !== 'stage_4')) {
    throw new Error('Propozycja ponaglenia bez kompletu danych');
  }

  const client = createAdminClient();
  const currentInvoice = await client.from('invoices')
    .select('id, gross_total, paid_amount, reminders_paused')
    .eq('id', invoiceId)
    .eq('tenant_id', ctx.proposal.tenant_id)
    .maybeSingle();
  if (currentInvoice.error || !currentInvoice.data) {
    throw new Error('Faktura nie należy do organizacji albo już nie istnieje');
  }

  // ── Okno bezpieczeństwa ──────────────────────────────────────
  //
  // Check payments for this owned invoice. The schema stores a payment day,
  // not paid_at; treat the entire day as recent rather than guess its time.
  const recent = await client
    .from('payments')
    .select('payment_date')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', ctx.proposal.tenant_id)
    .order('payment_date', { ascending: false })
    .limit(1);

  if (recent.error) throw new Error(recent.error.message);

  const lastPaymentDate = recent.data?.[0]?.payment_date;
  const lastPaymentAt = typeof lastPaymentDate === 'string'
    ? lastPaymentDate + 'T23:59:59.999Z'
    : null;
  const outstanding = Number(currentInvoice.data.gross_total) - Number(currentInvoice.data.paid_amount);
  if (!Number.isFinite(outstanding)) throw new Error('Nieprawidłowa kwota należności');

  const safety = evaluateChaseSafety({
    outstanding,
    lastPaymentFromContractorAt: lastPaymentAt,
    remindersPaused: currentInvoice.data.reminders_paused === true,
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
