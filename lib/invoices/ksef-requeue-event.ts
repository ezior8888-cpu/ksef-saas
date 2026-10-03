/**
 * Zdarzenie `invoice/submit.requested` odtworzone z wiersza faktury — dla
 * ponowień bez udziału klienta (cron cyklu życia, operator). Tylko zwykła
 * faktura VAT: korekta, zaliczka i ROZ niosą dane specjalne, których wiersz
 * nie przechowuje, więc ich zdarzenia nie da się odtworzyć (jak w akcji
 * szkicu i w `decideResend`).
 *
 * Czysty moduł (bez Supabase i Next), żeby runner i akcje dzieliły jedną
 * definicję tego, co jest „kompletnym” wierszem do ponowienia.
 */

import type { JobEvent } from '@/lib/jobs/enqueue';
import type { Invoice } from '@/types/invoice';
import type { KsefEnvironment } from '@/types/ksef';

export interface KsefRequeueSourceRow {
  id: string;
  tenant_id: string;
  invoice_kind: string | null;
  fa3_data: unknown;
  tenants: { nip: string | null } | { nip: string | null }[] | null;
}

export type KsefRequeueEventResult =
  | { ok: true; event: JobEvent; sendAttemptId: string }
  | { ok: false; reason: 'special-kind' | 'incomplete' | 'no-nip' };

export function buildKsefRequeueEvent(
  row: KsefRequeueSourceRow,
  environment: KsefEnvironment,
  sendAttemptId: string,
): KsefRequeueEventResult {
  if ((row.invoice_kind ?? 'regular') !== 'regular') return { ok: false, reason: 'special-kind' };
  const invoice = row.fa3_data as Invoice | null;
  if (!invoice || typeof invoice !== 'object' || !Array.isArray(invoice.lines)) {
    return { ok: false, reason: 'incomplete' };
  }
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  const nip = (tenant?.nip ?? invoice.seller?.nip ?? '').replace(/\s+/g, '');
  if (!nip) return { ok: false, reason: 'no-nip' };

  return {
    ok: true,
    sendAttemptId,
    event: {
      groupId: row.tenant_id,
      // W kolejce czeka najwyżej jedno zlecenie na fakturę.
      singletonKey: row.id,
      name: 'invoice/submit.requested',
      data: {
        tenantId: row.tenant_id,
        invoiceId: row.id,
        invoice,
        nip,
        environment,
        sendAttemptId,
      },
    },
  };
}
