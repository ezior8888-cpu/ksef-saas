'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { recurringDb } from '@/lib/invoices/recurring/db';
import { getRecurringInvoice } from '@/lib/invoices/recurring/queries';
import { catchUpRunDate, firstRunDate, rescheduleRunDate } from '@/lib/invoices/recurring/schedule';
import { templateRejection } from '@/lib/invoices/recurring/template';
import {
  recurringInvoiceIdSchema,
  recurringInvoiceSchema,
  type RecurringInvoiceFormValues,
} from '@/lib/schemas/recurring-invoice';
import { ActionAuthError, requireUserAndActiveOrg, type AuthContext } from '@/lib/supabase/auth-context';
import type { RecurringInvoiceRow } from '@/types/recurring-invoice';

/**
 * Akcje faktur cyklicznych (plan Finora N1, P6). Klient z sesji (RLS), rola
 * jak przy wystawianiu faktur: każdy aktywny członek firmy
 * (`requireUserAndActiveOrg`, jak `getTenantContext` w
 * components/invoices/actions.ts). Każda zmiana trafia do `audit_logs`.
 *
 * Żadna z tych akcji nie tworzy faktury ani szkicu. Fakturę wystawia
 * człowiek w formularzu `/invoices/new/regular?cykliczna=<id>`.
 */

export type RecurringInvoiceActionResult =
  | { success: true; recurringInvoice: RecurringInvoiceRow }
  | { success: false; error: string };

export type RecurringInvoiceDeleteResult = { success: true } | { success: false; error: string };

const RECURRING_COLUMNS =
  'id, tenant_id, template_invoice_id, name, frequency, day_of_month, next_run_date, active, created_by, created_at, updated_at';

const NOT_FOUND = 'Nie znaleziono tej faktury cyklicznej — mogła zostać usunięta. Odśwież stronę.';
const CHANGED_MEANWHILE = 'Faktura cykliczna zmieniła się w międzyczasie. Odśwież stronę i spróbuj ponownie.';
const SAVE_FAILED = 'Nie udało się zapisać faktury cyklicznej. Spróbuj ponownie za chwilę.';
const DB_PENDING = 'Faktury cykliczne czekają jeszcze na aktualizację bazy danych. Spróbuj ponownie później.';

/** Brak tabeli albo kolumny z 00154 (przed wgraniem migracji). */
function isSchemaPending(code: string | undefined): boolean {
  return code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204';
}

function saveError(code: string | undefined): string {
  return isSchemaPending(code) ? DB_PENDING : SAVE_FAILED;
}

async function context(): Promise<{ ok: true; ctx: AuthContext } | { ok: false; error: string }> {
  try {
    return { ok: true, ctx: await requireUserAndActiveOrg() };
  } catch (e) {
    if (e instanceof ActionAuthError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Sprawdza fakturę-wzór tej firmy; komunikat po polsku albo `null`, gdy wzór jest dobry. */
async function templateError(ctx: AuthContext, templateInvoiceId: string): Promise<string | null> {
  const { data, error } = await recurringDb(ctx.supabase)
    .from('invoices')
    .select('id, direction, origin, invoice_kind, invoice_type, ksef_status, currency')
    .eq('id', templateInvoiceId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) return 'Nie udało się sprawdzić faktury-wzoru. Spróbuj ponownie za chwilę.';
  if (!data) return 'Nie znaleziono faktury-wzoru w tej firmie.';
  return templateRejection(data);
}

function revalidate(): void {
  revalidatePath('/invoices/recurring');
  revalidatePath('/invoices');
}

/**
 * Nowa faktura cykliczna z istniejącej faktury. Pierwsze wystawienie:
 * najbliższy dzień `dayOfMonth` od dziś (Europe/Warsaw), więc pozycja
 * z dzisiejszym dniem od razu jest „Do wystawienia”.
 */
export async function createRecurringInvoiceAction(
  input: RecurringInvoiceFormValues,
): Promise<RecurringInvoiceActionResult> {
  const parsed = recurringInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane faktury cyklicznej.' };
  }
  const auth = await context();
  if (!auth.ok) return { success: false, error: auth.error };
  const { ctx } = auth;
  const values = parsed.data;

  const rejected = await templateError(ctx, values.templateInvoiceId);
  if (rejected) return { success: false, error: rejected };

  const { data, error } = await recurringDb(ctx.supabase)
    .from('recurring_invoices')
    .insert({
      tenant_id: ctx.tenantId,
      template_invoice_id: values.templateInvoiceId,
      name: values.name,
      frequency: values.frequency,
      day_of_month: values.dayOfMonth,
      next_run_date: firstRunDate(todayInWarsaw(), values.dayOfMonth),
      active: true,
      created_by: ctx.user.id,
    })
    .select(RECURRING_COLUMNS)
    .single();
  if (error || !data) return { success: false, error: saveError(error?.code) };

  await logAudit({
    action: 'recurring_invoice.created',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'recurring_invoice',
    entityId: data.id,
    metadata: {
      templateInvoiceId: data.template_invoice_id,
      frequency: data.frequency,
      dayOfMonth: data.day_of_month,
      nextRunDate: data.next_run_date,
    },
  });
  revalidate();
  return { success: true, recurringInvoice: data };
}

/**
 * Edycja: nazwa, częstotliwość, dzień i faktura-wzór — nigdy treść wzoru.
 * Zmiana dnia albo częstotliwości przelicza `next_run_date` w tym samym
 * miesiącu (`rescheduleRunDate`), więc czekający okres nie przepada. Zapis
 * warunkowy na `next_run_date` z odczytu: jeśli w międzyczasie ktoś wystawił
 * fakturę (data się przesunęła), odmowa zamiast cofnięcia harmonogramu.
 */
export async function updateRecurringInvoiceAction(
  id: string,
  input: RecurringInvoiceFormValues,
): Promise<RecurringInvoiceActionResult> {
  const idOk = recurringInvoiceIdSchema.safeParse(id);
  if (!idOk.success) return { success: false, error: NOT_FOUND };
  const parsed = recurringInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane faktury cyklicznej.' };
  }
  const auth = await context();
  if (!auth.ok) return { success: false, error: auth.error };
  const { ctx } = auth;
  const values = parsed.data;

  const current = await getRecurringInvoice(ctx.supabase, ctx.tenantId, idOk.data);
  if (!current) return { success: false, error: NOT_FOUND };

  if (values.templateInvoiceId !== current.template_invoice_id) {
    const rejected = await templateError(ctx, values.templateInvoiceId);
    if (rejected) return { success: false, error: rejected };
  }

  const scheduleChanged =
    values.frequency !== current.frequency || values.dayOfMonth !== current.day_of_month;
  const nextRun = scheduleChanged
    ? rescheduleRunDate(current.next_run_date, values.dayOfMonth)
    : current.next_run_date;

  const { data, error } = await recurringDb(ctx.supabase)
    .from('recurring_invoices')
    .update({
      name: values.name,
      frequency: values.frequency,
      day_of_month: values.dayOfMonth,
      template_invoice_id: values.templateInvoiceId,
      next_run_date: nextRun,
    })
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('next_run_date', current.next_run_date)
    .select(RECURRING_COLUMNS)
    .maybeSingle();
  if (error) return { success: false, error: saveError(error.code) };
  if (!data) return { success: false, error: CHANGED_MEANWHILE };

  await logAudit({
    action: 'recurring_invoice.updated',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'recurring_invoice',
    entityId: data.id,
    metadata: {
      from: {
        name: current.name,
        frequency: current.frequency,
        dayOfMonth: current.day_of_month,
        templateInvoiceId: current.template_invoice_id,
        nextRunDate: current.next_run_date,
      },
      to: {
        name: data.name,
        frequency: data.frequency,
        dayOfMonth: data.day_of_month,
        templateInvoiceId: data.template_invoice_id,
        nextRunDate: data.next_run_date,
      },
    },
  });
  revalidate();
  return { success: true, recurringInvoice: data };
}

/** Wstrzymanie: pozycja zostaje, nie przypomina i nie da się z niej wystawić faktury. */
export async function pauseRecurringInvoiceAction(id: string): Promise<RecurringInvoiceActionResult> {
  return setActive(id, false);
}

/**
 * Wznowienie: okresy, które w całości minęły w czasie wstrzymania, pomijamy;
 * ostatni okres, którego dzień już nadszedł, zostaje „Do wystawienia”
 * (`catchUpRunDate`).
 */
export async function resumeRecurringInvoiceAction(id: string): Promise<RecurringInvoiceActionResult> {
  return setActive(id, true);
}

async function setActive(id: string, active: boolean): Promise<RecurringInvoiceActionResult> {
  const idOk = recurringInvoiceIdSchema.safeParse(id);
  if (!idOk.success) return { success: false, error: NOT_FOUND };
  const auth = await context();
  if (!auth.ok) return { success: false, error: auth.error };
  const { ctx } = auth;

  const current = await getRecurringInvoice(ctx.supabase, ctx.tenantId, idOk.data);
  if (!current) return { success: false, error: NOT_FOUND };
  if (current.active === active) return { success: true, recurringInvoice: current };

  const nextRun = active
    ? catchUpRunDate(current.next_run_date, current.frequency, current.day_of_month, todayInWarsaw())
    : current.next_run_date;

  const { data, error } = await recurringDb(ctx.supabase)
    .from('recurring_invoices')
    .update({ active, next_run_date: nextRun })
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('active', current.active)
    .eq('next_run_date', current.next_run_date)
    .select(RECURRING_COLUMNS)
    .maybeSingle();
  if (error) return { success: false, error: saveError(error.code) };
  if (!data) return { success: false, error: CHANGED_MEANWHILE };

  await logAudit({
    action: active ? 'recurring_invoice.resumed' : 'recurring_invoice.paused',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'recurring_invoice',
    entityId: data.id,
    metadata: { fromNextRunDate: current.next_run_date, toNextRunDate: data.next_run_date },
  });
  revalidate();
  return { success: true, recurringInvoice: data };
}

/**
 * Usunięcie pozycji. Wystawione z niej faktury zostają bez zmian
 * (00154: `ON DELETE SET NULL (recurring_invoice_id)` zeruje samo powiązanie,
 * okres `recurring_period` zostaje jako ślad).
 */
export async function deleteRecurringInvoiceAction(id: string): Promise<RecurringInvoiceDeleteResult> {
  const idOk = recurringInvoiceIdSchema.safeParse(id);
  if (!idOk.success) return { success: false, error: NOT_FOUND };
  const auth = await context();
  if (!auth.ok) return { success: false, error: auth.error };
  const { ctx } = auth;

  const { data, error } = await recurringDb(ctx.supabase)
    .from('recurring_invoices')
    .delete()
    .eq('id', idOk.data)
    .eq('tenant_id', ctx.tenantId)
    .select('id, name, template_invoice_id');
  if (error) {
    return {
      success: false,
      error: isSchemaPending(error.code) ? DB_PENDING : 'Nie udało się usunąć faktury cyklicznej. Spróbuj ponownie za chwilę.',
    };
  }
  const deleted = data?.[0];
  if (!deleted) return { success: false, error: NOT_FOUND };

  await logAudit({
    action: 'recurring_invoice.deleted',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'recurring_invoice',
    entityId: deleted.id,
    metadata: { name: deleted.name, templateInvoiceId: deleted.template_invoice_id },
  });
  revalidate();
  return { success: true };
}
