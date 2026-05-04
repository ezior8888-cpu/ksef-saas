'use server';

import { revalidatePath } from 'next/cache';

import { formatInngestSendError } from '@/lib/inngest/error-message';
import { inngest, remindersSendRequested } from '@/lib/inngest/client';
import { createClient } from '@/lib/supabase/server';
import {
  decideNextReminder,
  type InvoiceForScheduling,
  type ReminderStage,
} from '@/lib/reminders/scheduler';
import type { Database } from '@/types/database';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];

export type ReminderSettingsPayload = Partial<
  Pick<
    Database['public']['Tables']['reminder_settings']['Insert'],
    | 'enabled'
    | 'stage_1_enabled'
    | 'stage_1_days_after_due'
    | 'stage_2_enabled'
    | 'stage_2_days_after_due'
    | 'stage_3_enabled'
    | 'stage_3_days_after_due'
    | 'sender_name'
    | 'sender_email'
    | 'reply_to_email'
    | 'pause_on_reply'
    | 'pause_on_partial_payment'
    | 'send_on_weekdays_only'
    | 'send_hour'
    | 'max_reminders_per_invoice'
  >
>;

function toInvoiceForScheduling(row: InvoiceRow): InvoiceForScheduling {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    internal_number: row.internal_number,
    payment_due_date: row.payment_due_date,
    gross_total: row.gross_total,
    paid_amount: row.paid_amount,
    buyer_data: row.buyer_data,
    buyer_nip: row.buyer_nip,
    reminders_paused: row.reminders_paused,
  };
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

// ============================================================================
// Manual trigger reminder dla konkretnej faktury
// ============================================================================

export async function triggerManualReminderAction(
  invoiceId: string,
  stage?: ReminderStage,
): Promise<
  | { success: true; reminderId: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { data: invoiceRow, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoiceRow) {
    return { success: false, error: 'Faktura nie znaleziona' };
  }

  let stageToUse: ReminderStage;
  if (stage) {
    stageToUse = stage;
  } else {
    const decision = await decideNextReminder(toInvoiceForScheduling(invoiceRow));
    if (!decision.shouldSend || !decision.stage) {
      return {
        success: false,
        error: decision.skipReason ?? 'Nie ma co wysłać',
      };
    }
    stageToUse = decision.stage;
  }

  const { data: reminder, error } = await supabase
    .from('payment_reminders')
    .insert({
      tenant_id: invoiceRow.tenant_id,
      invoice_id: invoiceId,
      stage: stageToUse,
      channel: 'email',
      scheduled_for: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !reminder) {
    return {
      success: false,
      error:
        error?.code === '23505'
          ? 'Ten etap już został wysłany'
          : (error?.message ?? 'Błąd zapisu'),
    };
  }

  try {
    await inngest.send(remindersSendRequested.create({ reminderId: reminder.id }));
  } catch (e) {
    await supabase
      .from('payment_reminders')
      .delete()
      .eq('id', reminder.id)
      .eq('status', 'pending');
    return { success: false, error: formatInngestSendError(e) };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, reminderId: reminder.id };
}

// ============================================================================
// Pause/resume przypomnienia dla faktury
// ============================================================================

export async function toggleInvoiceRemindersAction(
  invoiceId: string,
  paused: boolean,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { error } = await supabase
    .from('invoices')
    .update({
      reminders_paused: paused,
      reminders_paused_reason: paused ? (reason ?? null) : null,
    })
    .eq('id', invoiceId);

  if (error) return { success: false, error: error.message };

  if (paused) {
    const { error: cancelErr } = await supabase
      .from('payment_reminders')
      .update({
        status: 'cancelled',
        failure_reason: 'Wstrzymane przez użytkownika',
      })
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending');
    if (cancelErr) return { success: false, error: cancelErr.message };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath('/payments/overdue');

  return { success: true };
}

// ============================================================================
// Update settings Wkurzacza
// ============================================================================

export async function updateReminderSettingsAction(
  settings: ReminderSettingsPayload,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { data: userTenant, error: userErr } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (userErr || !userTenant?.tenant_id) {
    return { success: false, error: 'Brak przypisania do tenanta' };
  }

  if (userTenant.role !== 'owner') {
    return {
      success: false,
      error: 'Tylko właściciel może zmieniać ustawienia',
    };
  }

  const tenantId = userTenant.tenant_id;
  const patch = pickDefined(settings as Record<string, unknown>);

  const { error } = await supabase.from('reminder_settings').upsert(
    {
      tenant_id: tenantId,
      ...patch,
    },
    { onConflict: 'tenant_id' },
  );

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/reminders');
  return { success: true };
}

// ============================================================================
// Mark contractor as excluded
// ============================================================================

export async function toggleContractorRemindersAction(
  contractorId: string,
  excluded: boolean,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { error } = await supabase
    .from('contractors')
    .update({
      reminder_excluded: excluded,
      reminder_exclusion_reason: excluded ? (reason ?? null) : null,
    })
    .eq('id', contractorId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/contractors');
  return { success: true };
}
