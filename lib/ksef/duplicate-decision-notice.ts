/**
 * Ślad powiadomienia „Faktura … czeka na Twoją decyzję” (D-A4-1b-3 PR B,
 * decyzje Bartosza 07.10.2026 (5) i (12); spec §2.8).
 *
 * E-mail idzie DOKŁADNIE RAZ na fakturę i numer KSeF oryginału (K) —
 * trwały ślad w `audit_logs` (`invoice.ksef_duplicate_decision_notified`,
 * `metadata.original_ksef_number`). Operator może przypomnieć klientowi
 * najwyżej raz na 24 h; przypomnienie ma własny klucz idempotencji.
 *
 * Fail-closed w obie strony:
 *   - błąd odczytu śladu RZUCA — „nie wiem, co wysłałem” to nie „nic nie
 *     wysłałem” (precedens `cert-expiry-alert.ts`);
 *   - błąd zapisu śladu RZUCA — nie `logAuditSystem`, który połyka błędy:
 *     zgubiony ślad złamałby „dokładnie raz”.
 *
 * Tylko klient serwisowy (`@/lib/supabase/admin`) — wywołania z joba
 * powiadomień i z akcji operatora (po `requireAdmin()`).
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** Akcja śladu w `audit_logs` (raport dzienny liczy ją w akcjach doby). */
export const DUPLICATE_NOTICE_ACTION = 'invoice.ksef_duplicate_decision_notified';

/** Odstęp między powiadomieniami o tej samej fakturze i K (decyzja 12). */
export const DUPLICATE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Najwięcej śladów czytanych dla jednej faktury (przypomnienia są rzadkie). */
const NOTICE_READ_LIMIT = 200;

/**
 * Klucz idempotencji Resend: `ksef-duplicate-decision/{faktura}/{K}`, a dla
 * przypomnienia `…/przypomnienie-{n}`, gdzie `n` to liczba śladów przed
 * kliknięciem — podwójne kliknięcie przed zapisem trafia w ten sam klucz.
 */
export function duplicateNoticeKey(invoiceId: string, ksefNumber: string, reminder: number | null): string {
  const base = `ksef-duplicate-decision/${invoiceId}/${ksefNumber}`;
  return reminder === null ? base : `${base}/przypomnienie-${reminder}`;
}

export interface DuplicateNotices {
  /** Liczba śladów powiadomień o tej fakturze i tym K. */
  count: number;
  /** Najnowszy ślad (ISO); `null` — bez powiadomienia. */
  lastAt: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Ślady powiadomień o fakturze `invoiceId` i numerze KSeF oryginału `ksefNumber`.
 * Ślad o innym K się nie liczy (inny oryginał = nowa decyzja). Rzuca przy
 * błędzie odczytu.
 */
export async function findDuplicateNotices(
  tenantId: string,
  invoiceId: string,
  ksefNumber: string,
): Promise<DuplicateNotices> {
  const { data, error } = await createAdminClient()
    .from('audit_logs')
    .select('created_at, metadata')
    .eq('action', DUPLICATE_NOTICE_ACTION)
    .eq('tenant_id', tenantId)
    .eq('entity_id', invoiceId)
    .eq('metadata->>original_ksef_number', ksefNumber)
    .order('created_at', { ascending: false })
    .limit(NOTICE_READ_LIMIT);
  if (error) throw new Error(`Nie można odczytać śladu powiadomień o decyzji klienta: ${error.message}`);
  const rows = ((data ?? []) as Array<{ created_at: string | null; metadata: unknown }>)
    // Filtr po K także tutaj — wynik nie zależy od tego, jak baza czyta ścieżkę jsonb.
    .filter((r) => isRecord(r.metadata) && r.metadata.original_ksef_number === ksefNumber);
  let lastAt: string | null = null;
  let lastMs = -Infinity;
  for (const r of rows) {
    const t = r.created_at ? Date.parse(r.created_at) : Number.NaN;
    if (!Number.isNaN(t) && t > lastMs) {
      lastMs = t;
      lastAt = r.created_at;
    }
  }
  return { count: rows.length, lastAt };
}

export interface DuplicateNoticeRecord {
  tenantId: string;
  invoiceId: string;
  /** K — numer KSeF oryginału, o którym było powiadomienie. */
  ksefNumber: string;
  /** `auto` — job po `invoice/submit.failed`; `operator` — „Przypomnij klientowi”. */
  via: 'auto' | 'operator';
  idempotencyKey: string;
  emailed: boolean;
  pushSent: number;
  /** Numer przypomnienia (liczba śladów przed nim); `null` dla pierwszego powiadomienia. */
  reminder?: number | null;
  /** E-mail operatora przy przypomnieniu. */
  operatorEmail?: string | null;
  /** Operator przy przypomnieniu; `null` dla joba. */
  userId?: string | null;
}

/**
 * Zapis śladu powiadomienia — bezpośredni insert do `audit_logs`. RZUCA przy
 * błędzie (job ponowi od zera z tym samym kluczem Resend; operator dostaje
 * komunikat, że ślad się nie zapisał).
 */
export async function recordDuplicateNotice(record: DuplicateNoticeRecord): Promise<void> {
  const { error } = await createAdminClient().from('audit_logs').insert({
    tenant_id: record.tenantId,
    user_id: record.userId ?? null,
    action: DUPLICATE_NOTICE_ACTION,
    entity_type: 'invoice',
    entity_id: record.invoiceId,
    metadata: {
      original_ksef_number: record.ksefNumber,
      via: record.via,
      idempotency_key: record.idempotencyKey,
      emailed: record.emailed,
      push_sent: record.pushSent,
      reminder: record.reminder ?? null,
      operator: record.operatorEmail ?? null,
      source: 'system',
    },
    ip_address: null,
    user_agent: record.via === 'operator' ? 'admin-ksef' : 'inngest-job',
  });
  if (error) throw new Error(`Nie można zapisać śladu powiadomienia o decyzji klienta: ${error.message}`);
}
