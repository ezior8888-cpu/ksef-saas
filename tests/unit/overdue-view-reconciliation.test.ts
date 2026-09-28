import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

const previous = migration('00082_invoices_overdue_outgoing.sql');
const guarded = migration('00096_invoices_overdue_reconciliation_guard.sql');

function projection(sql: string): string {
  const match = /CREATE OR REPLACE VIEW public\.invoices_overdue\s+WITH\s*\(security_invoker\s*=\s*true\)\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM public\.invoices i\b/i.exec(sql);
  if (!match) throw new Error('Missing security-invoker overdue view definition');
  return match[1]!.replace(/\s+/g, ' ').trim();
}

describe('overdue view reconciliation migration', () => {
  it('preserves the existing column contract and security invoker', () => {
    expect(projection(guarded)).toBe(projection(previous));
    expect(guarded).toMatch(/REVOKE ALL ON public\.invoices_overdue FROM anon/);
    expect(guarded).toMatch(/GRANT SELECT ON public\.invoices_overdue TO authenticated/);
  });

  it('fails closed for imports, mismatched types and every same-tenant child', () => {
    expect(guarded).toMatch(/i\.origin\s*=\s*'app'/);
    expect(guarded).toMatch(/i\.invoice_kind\s*=\s*'regular'\s+AND\s+i\.invoice_type IN \('VAT', 'UPR'\)/);
    expect(guarded).toMatch(/i\.invoice_kind\s*=\s*'advance'\s+AND\s+i\.invoice_type\s*=\s*'ZAL'/);
    expect(guarded).toMatch(/i\.invoice_kind\s*=\s*'final'\s+AND\s+i\.invoice_type\s*=\s*'ROZ'/);
    const childPredicate = /AND NOT EXISTS \(\s*SELECT 1\s+FROM public\.invoices child\s+WHERE child\.tenant_id\s*=\s*i\.tenant_id\s+AND \(child\.parent_invoice_id\s*=\s*i\.id\s+OR i\.id\s*=\s*ANY\(child\.advance_invoice_ids\)\)\s*\)/.exec(guarded);
    expect(childPredicate).not.toBeNull();
    expect(childPredicate?.[0]).not.toMatch(/child\.(payment_status|ksef_status|invoice_kind|invoice_type)/);
    expect(guarded).toMatch(/i\.gross_total\s*>\s*0[\s\S]*i\.paid_amount\s*<\s*i\.gross_total/);
  });
});
