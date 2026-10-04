/**
 * Panel operatora `/admin/ksef` — dane cyklu życia faktury (PR 3c).
 *
 * Czyta kluczem serwisowym, dlatego każda funkcja najpierw `requireAdmin()`
 * (wzorzec `lib/admin/support.ts`). Źródła: `ksef_lifecycle_violations()`
 * (strażnik I1–I5, I9 z 00131), `invoices` po kodzie z katalogu
 * `ksef_error_codes`, historia `ksef_submissions`, ślad w `audit_logs`.
 */

import { hasOpenSubmission } from '@/lib/admin/ksef-operator-policy';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { parseDuplicateCheck, type KsefDuplicateCheck } from '@/lib/ksef/duplicate-check';
import { sendErrorClassOf, type SendErrorClass } from '@/lib/ksef/send-error-classes';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/** Wartość filtra `?code=` dla faktur bez kodu (historycznych). */
export const NO_CODE_FILTER = 'brak';

export const INVARIANT_LABELS: Record<string, string> = {
  I1: 'queued bez zlecenia w pg-boss (ponad 15 min)',
  I2: 'sending dłużej niż dzierżawa (ponad 30 min) albo bez znacznika przejęcia',
  I3: 'accepted bez numeru KSeF, środowiska, pliku XML albo UPO',
  I4: 'failed / rejected bez kodu z katalogu albo z trzymanym przejęciem',
  I5: 'otwarty wpis sent albo zamiar intent starszy niż 48 h',
  I9: 'failed / rejected z numerem KSeF (stan sprzeczny)',
};

export interface ViolationSummary {
  invariant: string;
  label: string;
  count: number;
}

/** Zliczenie naruszeń per inwariant — czysta funkcja do testów. */
export function summarizeViolations(rows: ReadonlyArray<{ invariant: string }>): ViolationSummary[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.invariant, (counts.get(row.invariant) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([invariant, count]) => ({ invariant, label: INVARIANT_LABELS[invariant] ?? invariant, count }));
}

export interface CodeCount {
  /** Kod z katalogu albo `NO_CODE_FILTER` dla braku kodu. */
  code: string;
  errorClass: SendErrorClass | null;
  failed: number;
  rejected: number;
  total: number;
}

/** Faktury failed/rejected per kod — czysta funkcja do testów; PostgREST nie ma GROUP BY. */
export function countByCode(
  rows: ReadonlyArray<{ last_error_code: string | null; ksef_status: string | null }>,
): CodeCount[] {
  const counts = new Map<string, CodeCount>();
  for (const row of rows) {
    const code = row.last_error_code ?? NO_CODE_FILTER;
    const entry = counts.get(code) ?? { code, errorClass: sendErrorClassOf(row.last_error_code), failed: 0, rejected: 0, total: 0 };
    if (row.ksef_status === 'rejected') entry.rejected += 1;
    else entry.failed += 1;
    entry.total += 1;
    counts.set(code, entry);
  }
  return [...counts.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

type TenantEmbed = { name: string | null; nip: string | null } | { name: string | null; nip: string | null }[] | null;

function tenantOf(embed: TenantEmbed): { name: string | null; nip: string | null } {
  const t = Array.isArray(embed) ? embed[0] : embed;
  return { name: t?.name ?? null, nip: t?.nip ?? null };
}

/** Wiersz z `ksef_lifecycle_violations()` (RETURNS TABLE, bez argumentów). */
interface ViolationRow {
  invariant: string;
  invoice_id: string;
  tenant_id: string;
  detail: Json;
}

export interface LifecycleViolation {
  invariant: string;
  label: string;
  invoiceId: string;
  tenantId: string;
  tenantName: string | null;
  internalNumber: string | null;
  ksefStatus: string | null;
  detail: Json;
}

export async function listLifecycleViolations(): Promise<LifecycleViolation[]> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('ksef_lifecycle_violations');
  if (error) throw new Error(`ksef_lifecycle_violations: ${error.message}`);
  const rows = (data ?? []) as ViolationRow[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.invoice_id))];
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, internal_number, ksef_status, tenants(name, nip)')
    .in('id', ids);
  if (invoicesError) throw new Error(`invoices lookup: ${invoicesError.message}`);
  type InvoiceRow = { id: string; internal_number: string | null; ksef_status: string | null; tenants: TenantEmbed };
  const byId = new Map(((invoices ?? []) as InvoiceRow[]).map((i) => [i.id, i]));

  return rows.map((r) => {
    const inv = byId.get(r.invoice_id);
    return {
      invariant: r.invariant,
      label: INVARIANT_LABELS[r.invariant] ?? r.invariant,
      invoiceId: r.invoice_id,
      tenantId: r.tenant_id,
      tenantName: inv ? tenantOf(inv.tenants).name : null,
      internalNumber: inv?.internal_number ?? null,
      ksefStatus: inv?.ksef_status ?? null,
      detail: r.detail,
    };
  });
}

export async function countLifecycleViolations(): Promise<number> {
  await requireAdmin();
  const { data, error } = await createAdminClient().rpc('ksef_lifecycle_violations');
  if (error) throw new Error(`ksef_lifecycle_violations: ${error.message}`);
  return (data ?? []).length;
}

export interface FailedInvoiceRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantNip: string | null;
  internalNumber: string | null;
  ksefStatus: string | null;
  errorCode: string | null;
  errorClass: SendErrorClass | null;
  lastError: string | null;
  sendOwner: string | null;
  updatedAt: string | null;
}

export async function listFailedInvoices(options: { code?: string | null; limit?: number } = {}): Promise<{
  rows: FailedInvoiceRow[];
  counts: CodeCount[];
}> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: all, error: allError } = await supabase
    .from('invoices')
    .select('last_error_code, ksef_status')
    .eq('direction', 'outgoing')
    .in('ksef_status', ['failed', 'rejected'])
    .limit(5000);
  if (allError) throw new Error(`invoices counts: ${allError.message}`);
  const counts = countByCode(all ?? []);

  let query = supabase
    .from('invoices')
    .select('id, tenant_id, internal_number, ksef_status, last_error_code, last_error, ksef_send_owner, updated_at, tenants(name, nip)')
    .eq('direction', 'outgoing')
    .in('ksef_status', ['failed', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(options.limit ?? 100);
  if (options.code === NO_CODE_FILTER) query = query.is('last_error_code', null);
  else if (options.code) query = query.eq('last_error_code', options.code);

  const { data, error } = await query;
  if (error) throw new Error(`invoices failed list: ${error.message}`);
  type Row = {
    id: string; tenant_id: string; internal_number: string | null; ksef_status: string | null;
    last_error_code: string | null; last_error: string | null; ksef_send_owner: string | null;
    updated_at: string | null; tenants: TenantEmbed;
  };
  const rows = ((data ?? []) as Row[]).map((row) => {
    const tenant = tenantOf(row.tenants);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: tenant.name,
      tenantNip: tenant.nip,
      internalNumber: row.internal_number,
      ksefStatus: row.ksef_status,
      errorCode: row.last_error_code,
      errorClass: sendErrorClassOf(row.last_error_code),
      lastError: row.last_error,
      sendOwner: row.ksef_send_owner,
      updatedAt: row.updated_at,
    };
  });
  return { rows, counts };
}

export interface SubmissionHistoryRow {
  id: string;
  status: string | null;
  sessionReferenceNumber: string | null;
  invoiceReferenceNumber: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  /** Znacznik 440 (00142): numer KSeF oryginału. */
  originalKsefNumber: string | null;
  /** D-A4-1b-3 (00144): dane oryginału przy nierozstrzygniętym 440. */
  originalCheck: KsefDuplicateCheck | null;
}

export interface AuditTrailRow {
  id: string;
  action: string;
  userId: string | null;
  createdAt: string;
  details: Json | null;
}

export interface InvoiceLifecycle {
  invoice: {
    id: string;
    tenantId: string;
    tenantName: string | null;
    tenantNip: string | null;
    internalNumber: string | null;
    direction: string | null;
    invoiceKind: string | null;
    invoiceType: string | null;
    issueDate: string | null;
    ksefStatus: string | null;
    ksefNumber: string | null;
    ksefEnvironment: string | null;
    errorCode: string | null;
    errorClass: SendErrorClass | null;
    lastError: string | null;
    sendOwner: string | null;
    submittedToKsefAt: string | null;
    lastAttemptAt: string | null;
    submissionAttempts: number | null;
    xmlStoragePath: string | null;
    updatedAt: string | null;
  };
  submissions: SubmissionHistoryRow[];
  audit: AuditTrailRow[];
  /** Jest otwarty wpis `sent` — „tylko uzgodnij” ma czego dotyczyć. */
  openSent: boolean;
  /** Dowód kontaktu z KSeF (`ksef_has_contact_evidence`) — blokuje powrót do szkicu. */
  evidence: boolean;
}

export async function getInvoiceLifecycle(invoiceId: string): Promise<InvoiceLifecycle | null> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: inv, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, internal_number, direction, invoice_kind, invoice_type, issue_date, ksef_status, ksef_number, ksef_environment, last_error_code, last_error, ksef_send_owner, submitted_to_ksef_at, last_attempt_at, submission_attempts, xml_storage_path, updated_at, tenants(name, nip)',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(`invoice lookup: ${error.message}`);
  if (!inv) return null;

  const [submissions, audit, evidence] = await Promise.all([
    supabase
      .from('ksef_submissions')
      .select('id, status, session_reference_number, invoice_reference_number, error_code, error_message, attempted_at, completed_at, original_ksef_number, original_check')
      .eq('invoice_id', invoiceId)
      .order('attempted_at', { ascending: false }),
    supabase
      .from('audit_logs')
      .select('id, action, user_id, created_at, details_json, metadata')
      .eq('entity_id', invoiceId)
      .like('action', 'invoice.%')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.rpc('ksef_has_contact_evidence', { p_invoice_id: invoiceId, p_tenant_id: inv.tenant_id }),
  ]);
  if (submissions.error) throw new Error(`ksef_submissions: ${submissions.error.message}`);
  if (audit.error) throw new Error(`audit_logs: ${audit.error.message}`);

  const tenant = tenantOf(inv.tenants as TenantEmbed);
  const history: SubmissionHistoryRow[] = (submissions.data ?? []).map((s) => ({
    id: s.id,
    status: s.status,
    sessionReferenceNumber: s.session_reference_number,
    invoiceReferenceNumber: s.invoice_reference_number,
    errorCode: s.error_code,
    errorMessage: s.error_message,
    attemptedAt: s.attempted_at,
    completedAt: s.completed_at,
    originalKsefNumber: s.original_ksef_number,
    // `original_check` z 00144 — typy bazy dogenerujemy z produkcji po wgraniu.
    originalCheck: parseDuplicateCheck((s as { original_check?: unknown }).original_check),
  }));

  return {
    invoice: {
      id: inv.id,
      tenantId: inv.tenant_id,
      tenantName: tenant.name,
      tenantNip: tenant.nip,
      internalNumber: inv.internal_number,
      direction: inv.direction,
      invoiceKind: inv.invoice_kind,
      invoiceType: inv.invoice_type,
      issueDate: inv.issue_date,
      ksefStatus: inv.ksef_status,
      ksefNumber: inv.ksef_number,
      ksefEnvironment: inv.ksef_environment,
      errorCode: inv.last_error_code,
      errorClass: sendErrorClassOf(inv.last_error_code),
      lastError: inv.last_error,
      sendOwner: inv.ksef_send_owner,
      submittedToKsefAt: inv.submitted_to_ksef_at,
      lastAttemptAt: inv.last_attempt_at,
      submissionAttempts: inv.submission_attempts,
      xmlStoragePath: inv.xml_storage_path,
      updatedAt: inv.updated_at,
    },
    submissions: history,
    audit: (audit.data ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      userId: a.user_id,
      createdAt: a.created_at,
      details: a.details_json ?? a.metadata ?? null,
    })),
    openSent: hasOpenSubmission(history),
    evidence: evidence.error ? true : Boolean(evidence.data),
  };
}
