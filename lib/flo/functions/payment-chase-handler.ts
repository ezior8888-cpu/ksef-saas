/** Outbound handler kept separate from the cron proposal builder. */
import { registerFloHandler } from '@/lib/flo/handlers';
import { remindersSendRequested } from '@/lib/inngest/client';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import { approvedReminderDelivery, authorizeReminderDispatch, hasReminderDispatch } from '@/lib/reminders/delivery-consent';
import { assertReminderSendable } from '@/lib/reminders/delivery-safety';

registerFloHandler('payment.chase', async (ctx) => {
  const delivery = approvedReminderDelivery(ctx.proposal, ctx.input);
  await assertReminderSendable(delivery);
  if (await hasReminderDispatch(delivery.tenantId, delivery.invoiceId, delivery.stage)) {
    throw new Error('Ten etap został już zlecony. Nie ponawiaj wysyłki; status musi sprawdzić administrator.');
  }
  // The approval ID is also the reminder PK: one consent cannot authorize a
  // second reminder. The client-writable reminder row is NOT the authority.
  const reminderId = ctx.approvalId;
  const client = createAdminClient();
  const created = await client.from('payment_reminders').insert({
    id: reminderId, tenant_id: delivery.tenantId, invoice_id: delivery.invoiceId,
    stage: delivery.stage, channel: 'email', scheduled_for: new Date().toISOString(), status: 'pending',
  }).select('id').maybeSingle();
  if (created.error || created.data?.id !== reminderId) {
    throw new Error('Przypomnienie dla tego etapu już istnieje lub nie udało się go zapisać. Sprawdź historię wysyłek.');
  }
  await authorizeReminderDispatch(ctx);
  // An ambiguous enqueue result must retain the row and its unique stage.
  // Deleting it could let a second consent send a duplicate message.
  try {
    await sendJobEvent(remindersSendRequested.create({ reminderId, approvalId: ctx.approvalId }));
  } catch {
    throw new Error('Nie można potwierdzić przyjęcia do kolejki. Sprawdź historię wysyłek przed kolejną próbą.');
  }
  return { summary: 'Przypomnienie zlecone do wysyłki', details: {
    invoiceId: delivery.invoiceId, reminderId, stage: delivery.stage,
  } };
});
