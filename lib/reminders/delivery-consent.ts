import 'server-only';
import { ReminderConsentDenied } from './delivery-errors';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { floDb, type FloApprovalRow, type FloProposalRow } from '@/lib/flo/db-types';
import { hasApprovalBinding, parseApprovalInput, proposalApprovalVersion } from '@/lib/flo/approval-version';
import { DISCLAIMER } from '@/lib/flo/functions/payment-chase';
import type { FloHandlerContext } from '@/lib/flo/handlers';
import type { FloApproveInput } from '@/types/flo';
import type { ReminderDelivery } from '@/types/reminder-delivery';
import { reminderDeliverySchema } from './delivery-schema';

const dispatchSchema = z.object({
  version: z.literal(1), reminderId: z.string().uuid(), authorizedAt: z.string().datetime(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), invoiceId: z.string().uuid(),
  stage: z.enum(['stage_1', 'stage_2', 'stage_3', 'stage_4']),
}).strict();

function digest(delivery: ReminderDelivery): string {
  // Schema parsing fixes field order and rejects unknown transport options.
  return createHash('sha256').update(JSON.stringify(reminderDeliverySchema.parse(delivery))).digest('hex');
}

export function approvedReminderDelivery(proposal: FloProposalRow, input?: FloApproveInput): ReminderDelivery {
  const delivery = reminderDeliverySchema.parse(proposal.payload.delivery);
  if (proposal.kind !== 'payment.chase' || delivery.tenantId !== proposal.tenant_id ||
      delivery.invoiceId !== proposal.payload.invoiceId || delivery.stage !== proposal.payload.stage ||
      input?.value !== undefined || input?.selectedIds !== undefined) {
    throw new ReminderConsentDenied('Przypomnienie wymaga nowego podglądu.');
  }
  const text = input?.editedBody ?? delivery.text;
  if (!text.trim() || !text.includes(DISCLAIMER)) {
    throw new ReminderConsentDenied('W treści pozostaw informację o płatności, która mogła już zostać wykonana.');
  }
  return reminderDeliverySchema.parse({ ...delivery, text });
}

function assertConsent(row: FloApprovalRow, proposal: FloProposalRow): ReminderDelivery {
  const input = parseApprovalInput(row.snapshot.input ?? undefined);
  const version = proposalApprovalVersion(proposal);
  if (row.proposal_id !== proposal.id || row.tenant_id !== proposal.tenant_id ||
      !row.consumed_at || !Number.isFinite(Date.parse(row.consumed_at)) ||
      proposal.approved_by !== row.user_id || proposal.payload.preparedBy !== row.user_id ||
      !hasApprovalBinding(row.snapshot, version, input)) {
    throw new ReminderConsentDenied('Nie można potwierdzić zgody na tę wiadomość.');
  }
  return approvedReminderDelivery(proposal, input);
}

export function assertDeliveryDeadline(row: FloApprovalRow, delivery: ReminderDelivery, now = Date.now()): void {
  const created = Date.parse(row.created_at);
  const consumed = Date.parse(row.consumed_at ?? '');
  const expires = Math.min(Date.parse(row.expires_at), Date.parse(delivery.expiresAt), created + 30 * 60_000);
  if (![created, consumed, expires].every(Number.isFinite) ||
      created > now || consumed < created || consumed > now || now >= expires) {
    throw new ReminderConsentDenied('Termin wysyłki minął. Nie ponawiaj jej bez sprawdzenia statusu przez administratora.');
  }
}

/** Written only after executeProposal consumed the exact operation and claimed it.
 * consumed_at alone is insufficient: expired/replaced tokens are also retired there. */
export async function authorizeReminderDispatch(ctx: FloHandlerContext): Promise<ReminderDelivery> {
  const db = floDb();
  const loaded = await db.from('flo_approvals').select('*')
    .eq('id', ctx.approvalId).eq('proposal_id', ctx.proposal.id)
    .eq('tenant_id', ctx.proposal.tenant_id).eq('user_id', ctx.userId).maybeSingle();
  if (loaded.error || !loaded.data) throw new Error('Nie można potwierdzić zgody na wiadomość.');
  const row = loaded.data;
  const delivery = assertConsent(row, ctx.proposal);
  if (proposalApprovalVersion(ctx.proposal) !== row.snapshot.proposalVersion ||
      digest(approvedReminderDelivery(ctx.proposal, ctx.input)) !== digest(delivery) ||
      ctx.proposal.status !== 'executing') throw new ReminderConsentDenied('Zgoda dotyczy innej operacji.');
  assertDeliveryDeadline(row, delivery);
  const dispatch = { version: 1 as const, reminderId: row.id,
    authorizedAt: row.consumed_at!, digest: digest(delivery), invoiceId: delivery.invoiceId, stage: delivery.stage };
  const written = await db.from('flo_approvals').update({ snapshot: { ...row.snapshot, reminderDispatch: dispatch } })
    .eq('id', row.id).eq('proposal_id', row.proposal_id).eq('tenant_id', row.tenant_id)
    .eq('user_id', row.user_id).eq('consumed_at', row.consumed_at!)
    .eq('snapshot->>operationHash', String(row.snapshot.operationHash))
    .select('id').maybeSingle();
  if (written.error || !written.data) throw new Error('Nie udało się zapisać zgody na wysyłkę.');
  return delivery;
}

export async function readReminderDispatch(approvalId: string) {
  const db = floDb();
  const loaded = await db.from('flo_approvals').select('*').eq('id', approvalId).maybeSingle();
  if (loaded.error) throw new Error('Nie można odczytać zgody na wysyłkę.');
  if (!loaded.data) throw new ReminderConsentDenied('Brak zapisanej zgody na wysyłkę.');
  const approval = loaded.data;
  const source = await db.from('flo_proposals').select('*')
    .eq('id', approval.proposal_id).eq('tenant_id', approval.tenant_id).maybeSingle();
  if (source.error) throw new Error('Nie można odczytać zatwierdzonego podglądu.');
  if (!source.data) throw new ReminderConsentDenied('Nie można potwierdzić zatwierdzonego podglądu.');
  const delivery = assertConsent(approval, source.data);
  const dispatch = dispatchSchema.parse(approval.snapshot.reminderDispatch);
  if (dispatch.reminderId !== approvalId || dispatch.digest !== digest(delivery) ||
      dispatch.authorizedAt !== approval.consumed_at) throw new ReminderConsentDenied('Zgoda dotyczy innej wysyłki.');
  if (dispatch.invoiceId !== delivery.invoiceId || dispatch.stage !== delivery.stage) throw new ReminderConsentDenied('Zgoda dotyczy innej faktury.');
  const stored = approval.snapshot.reminderReceipt;
  let receipt: { messageId: string; sentAt: string } | undefined;
  if (stored !== undefined) {
    const parsed = z.object({ messageId: z.string().min(1).max(200), sentAt: z.string().datetime(),
      digest: z.string(), reminderId: z.string().uuid() }).strict().parse(stored);
    if (parsed.digest !== dispatch.digest || parsed.reminderId !== approval.id) throw new ReminderConsentDenied('Nieprawidłowe potwierdzenie dostawy.');
    receipt = { messageId: parsed.messageId, sentAt: parsed.sentAt };
  }
  return { approval, delivery, proposal: source.data, receipt };
}

/** Trusted history survives changes/deletion of the client-writable reminder row. */
export async function hasReminderDispatch(tenantId: string, invoiceId: string, stage: string): Promise<boolean> {
  const result = await floDb().from('flo_approvals').select('id').eq('tenant_id', tenantId)
    .eq('snapshot->reminderDispatch->>invoiceId', invoiceId)
    .eq('snapshot->reminderDispatch->>stage', stage).limit(1);
  if (result.error) throw new Error('Nie można sprawdzić historii zgód na wysyłkę.');
  return Boolean(result.data?.length);
}

/** Store a provider receipt before any archive/UI bookkeeping. If this write is
 * ambiguous, retry only with the same envelope/key within the original deadline. */
export async function recordReminderReceipt(approval: FloApprovalRow, delivery: ReminderDelivery, messageId: string, sentAt: string) {
  const written = await floDb().from('flo_approvals').update({ snapshot: { ...approval.snapshot,
    reminderReceipt: { messageId, sentAt, digest: digest(delivery), reminderId: approval.id },
  } }).eq('id', approval.id).eq('tenant_id', delivery.tenantId).eq('proposal_id', approval.proposal_id)
    .eq('snapshot->reminderDispatch->>digest', digest(delivery)).select('id').maybeSingle();
  if (written.error || !written.data) throw new Error('Nie udało się utrwalić potwierdzenia dostawy.');
}
