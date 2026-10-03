/**
 * Znacznik „faktura ze skrzynki jeszcze nie domknięta” (K2, rewizja 03.10.2026).
 *
 * Odbiór skrzynki zapisuje wiersz `invoices` z metadanymi i
 * `fa3_data._pendingFullFetch = true`. Domknięcie — koszt w `expenses` oraz
 * oryginał XML w archiwum — robi job `auto-categorize-inbox` wyzwalany
 * zdarzeniem `inbox/invoice-received`. Zdarzenie wychodzi tuż po zapisie, ale
 * między zapisem a emisją może paść proces, pg-boss albo sam job; ponowienie
 * odbioru widzi wtedy fakturę „już w bazie” i nic nie emituje. Dlatego:
 *
 *   - `auto-categorize-inbox` po udanym przebiegu gasi znacznik
 *     (`markInboxInvoiceProcessed`),
 *   - cron `inbox-backfill` co 15 min emituje zdarzenie ponownie dla wierszy
 *     z zapalonym znacznikiem, licząc próby (`bumpInboxBackfillAttempt`).
 *
 * Znacznik żyje w `fa3_data`, bo tam od początku leżał (bez migracji);
 * zmienia go wyłącznie serwer (klient nie ma UPDATE na przyjętych fakturach —
 * 00073, 00117, 00119).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const INBOX_PENDING_FLAG = '_pendingFullFetch';
export const INBOX_BACKFILL_ATTEMPTS_FIELD = '_backfillAttempts';

type Fa3Record = Record<string, unknown>;

export function fa3Record(value: unknown): Fa3Record {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Fa3Record)
    : {};
}

export function inboxBackfillAttempts(fa3: unknown): number {
  const raw = fa3Record(fa3)[INBOX_BACKFILL_ATTEMPTS_FIELD];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

/** Koszt istnieje i XML jest w archiwum (albo nie jest potrzebny): znacznik gaśnie. */
export async function markInboxInvoiceProcessed(
  client: SupabaseClient,
  params: { tenantId: string; invoiceId: string },
): Promise<void> {
  const { tenantId, invoiceId } = params;
  const { data: row, error } = await client
    .from('invoices')
    .select('id, fa3_data')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !row) {
    throw new Error('Nie można odczytać faktury skrzynki do oznaczenia jako przetworzonej');
  }

  const fa3 = fa3Record(row.fa3_data);
  const { data: updated, error: updateError } = await client
    .from('invoices')
    .update({
      fa3_data: {
        ...fa3,
        [INBOX_PENDING_FLAG]: false,
        _processedAt: new Date().toISOString(),
      },
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle();
  if (updateError || updated?.id !== invoiceId) {
    throw new Error(updateError?.message ?? 'Nie można oznaczyć faktury skrzynki jako przetworzonej');
  }
}

/** Cron uzupełniający wysłał zdarzenie jeszcze raz — zapisz próbę przy fakturze. */
export async function bumpInboxBackfillAttempt(
  client: SupabaseClient,
  row: { id: string; tenant_id: string; fa3_data: unknown },
): Promise<void> {
  const fa3 = fa3Record(row.fa3_data);
  const { error } = await client
    .from('invoices')
    .update({
      fa3_data: {
        ...fa3,
        [INBOX_BACKFILL_ATTEMPTS_FIELD]: inboxBackfillAttempts(fa3) + 1,
        _backfillAt: new Date().toISOString(),
      },
    })
    .eq('id', row.id)
    .eq('tenant_id', row.tenant_id);
  if (error) {
    throw new Error(`Nie można zapisać próby uzupełnienia faktury skrzynki: ${error.message}`);
  }
}
