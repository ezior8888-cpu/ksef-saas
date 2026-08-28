/**
 * Przegląd porządku w dokumentach — spięcie X-05 z bazą (krok 30, wpięcie).
 *
 * Osobno od `ksef-audit.ts`, bo tamten moduł jest czysty i testowalny bez
 * bazy. Tutaj mieszka wyłącznie odczyt i pętla po organizacjach — czyli to,
 * co i tak trzeba by wyciąć z testów.
 */

import { buildAuditProposal, findAuditIssues } from '@/lib/flo/functions/ksef-audit';
import { createProposal } from '@/lib/flo/proposals';
import { createAdminClient } from '@/lib/supabase/admin';

/** Ile organizacji przegląda jeden przebieg. Reszta poczeka do jutra. */
const TENANT_BATCH = 200;

export async function runKsefAuditSweep(now: Date = new Date()): Promise<number> {
  const supabase = createAdminClient();

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id')
    .limit(TENANT_BATCH);

  if (error) throw new Error(error.message);

  const periodKey = now.toISOString().slice(0, 7);
  let created = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;

    const [invoices, contractors, expenses] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, internal_number, ksef_number, issue_date, ksef_status, source')
        .eq('tenant_id', tenantId)
        .eq('direction', 'issued')
        .limit(500),
      supabase
        .from('contractors')
        .select('id, name, nip')
        .eq('tenant_id', tenantId)
        .limit(500),
      supabase
        .from('expenses')
        .select('id, seller_name, image_path, issue_date, source')
        .eq('tenant_id', tenantId)
        .limit(500),
    ]);

    const rows = invoices.data ?? [];
    if (rows.length === 0) continue;

    // Pierwsza faktura wystawiona U NAS wyznacza granicę „zastane / bieżące".
    const own = rows.filter((r) => r.source !== 'import');
    const firstOwn =
      own.length > 0
        ? own.map((r) => String(r.issue_date)).sort()[0]!
        : null;

    const { data: upos } = await supabase
      .from('upo_receipts')
      .select('invoice_id')
      .in('invoice_id', rows.map((r) => r.id as string));

    const withUpo = new Set((upos ?? []).map((u) => u.invoice_id as string));

    const issues = findAuditIssues({
      firstOwnInvoiceDate: firstOwn,
      invoices: rows.map((r) => ({
        id: r.id as string,
        number: (r.internal_number as string | null) ?? null,
        ownNumbering: r.source !== 'import',
        issueDate: String(r.issue_date),
        status: String(r.ksef_status),
        hasUpo: withUpo.has(r.id as string),
      })),
      contractors: (contractors.data ?? []).map((c) => ({
        id: c.id as string,
        name: String(c.name),
        nip: (c.nip as string | null) ?? null,
      })),
      expenses: (expenses.data ?? []).map((e) => ({
        id: e.id as string,
        label: String(e.seller_name ?? 'Koszt'),
        hasDocument: Boolean(e.image_path) || e.source === 'ksef_invoice',
        issueDate: String(e.issue_date),
      })),
    });

    const proposal = buildAuditProposal({ tenantId, issues, periodKey, now });
    if (proposal) {
      const result = await createProposal(proposal);
      if (result.status === 'created') created++;
    }
  }

  return created;
}
