import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

const previous = migration('00082_invoices_overdue_outgoing.sql');
const guarded = migration('00126_invoices_overdue_reconciliation_guard.sql');
const rozAware = migration('00145_roz_amount_due.sql');

function projection(sql: string): string {
  const match = /CREATE OR REPLACE VIEW public\.invoices_overdue\s+WITH\s*\(security_invoker\s*=\s*true\)\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM public\.invoices i\b/i.exec(sql);
  if (!match) throw new Error('Missing security-invoker overdue view definition');
  return match[1]!.replace(/\s+/g, ' ').trim();
}

describe('overdue view reconciliation migration (00126)', () => {
  it('preserves the existing column contract and security invoker', () => {
    expect(projection(guarded)).toBe(projection(previous));
    expect(guarded).toMatch(/REVOKE ALL ON public\.invoices_overdue FROM anon/);
    expect(guarded).toMatch(/GRANT SELECT ON public\.invoices_overdue TO authenticated/);
  });

  it('fails closed for imports, final ROZ, mismatched types and every same-tenant child', () => {
    expect(guarded).toMatch(/i\.origin\s*=\s*'app'/);
    expect(guarded).toMatch(/i\.invoice_kind\s*=\s*'regular'\s+AND\s+i\.invoice_type IN \('VAT', 'UPR'\)/);
    expect(guarded).toMatch(/i\.invoice_kind\s*=\s*'advance'\s+AND\s+i\.invoice_type\s*=\s*'ZAL'/);
    expect(guarded).not.toMatch(/i\.invoice_kind\s*=\s*'final'/);
    expect(guarded).not.toMatch(/i\.invoice_type\s*=\s*'ROZ'/);
    // 1000 PLN gross with a 300 PLN settled advance may leave 700 PLN, but the
    // unchanged projection would report 1000 PLN when paid_amount is zero.
    expect(guarded).toMatch(/i\.gross_total\s*-\s*COALESCE\(i\.paid_amount,\s*0\)::NUMERIC AS amount_due/);
    const childPredicate = /AND NOT EXISTS \(\s*SELECT 1\s+FROM public\.invoices child\s+WHERE child\.tenant_id\s*=\s*i\.tenant_id\s+AND \(child\.parent_invoice_id\s*=\s*i\.id\s+OR i\.id\s*=\s*ANY\(child\.advance_invoice_ids\)\)\s*\)/.exec(guarded);
    expect(childPredicate).not.toBeNull();
    expect(childPredicate?.[0]).not.toMatch(/child\.(payment_status|ksef_status|invoice_kind|invoice_type)/);
    expect(guarded).toMatch(/i\.gross_total\s*>\s*0[\s\S]*i\.paid_amount\s*<\s*i\.gross_total/);
  });
});

/**
 * C-16 (00145) — inwersja 00126: ROZ nie jest już wykluczona, a amount_due
 * liczy się od `payment_data.amountDue` (reszta po zaliczkach), nie od
 * całego gross_total. Kolumny widoku (nazwy, kolejność) zostają te same co
 * w 00082/00126 — tylko wzór amount_due się zmienia, więc porównanie
 * projekcji nie może już być bajt-w-bajt identyczne; sprawdzamy kolejność
 * nazw kolumn z osobna.
 */
describe('ROZ amount-due migration (00145)', () => {
  it('admits ROZ by invoice_kind/invoice_type, unlike 00126', () => {
    expect(rozAware).toMatch(/i\.invoice_kind\s*=\s*'final'\s+AND\s+i\.invoice_type\s*=\s*'ROZ'/);
    // Keeps the two existing allowed combinations untouched.
    expect(rozAware).toMatch(/i\.invoice_kind\s*=\s*'regular'\s+AND\s+i\.invoice_type IN \('VAT', 'UPR'\)/);
    expect(rozAware).toMatch(/i\.invoice_kind\s*=\s*'advance'\s+AND\s+i\.invoice_type\s*=\s*'ZAL'/);
  });

  it('keeps the exact 00082/00126 column names and order; only the amount_due expression changes', () => {
    const columnOrder =
      /i\.id,\s*i\.tenant_id,\s*i\.internal_number,\s*i\.issue_date,\s*i\.payment_due_date,\s*i\.gross_total,\s*i\.paid_amount,\s*[\s\S]*?\)\s*-\s*COALESCE\(i\.paid_amount,\s*0\)::NUMERIC AS amount_due,\s*i\.payment_status,\s*public\.days_overdue\(i\.payment_due_date::DATE\)\s*AS days_overdue,\s*COALESCE\(i\.buyer_data->>'name',\s*''\)\s*AS buyer_name,\s*COALESCE\(i\.buyer_nip,\s*i\.buyer_data->>'nip',\s*''\)\s*AS buyer_nip,\s*COALESCE\(i\.buyer_data->>'email',\s*''\)\s*AS buyer_email,\s*i\.reminders_paused,\s*\(\s*SELECT COUNT\(\*\)::BIGINT[\s\S]*?\)\s*AS reminders_sent_count/;
    expect(projection(rozAware)).toMatch(columnOrder);
  });

  it('computes amount_due and the paid_amount filter from payment_data.amountDue for ROZ, capped at gross_total', () => {
    // The guarded regex before casting to numeric: a non-numeric or missing
    // amountDue must never error the trigger/view (payment_data is app data,
    // not trusted input) — it falls back to the full gross_total instead.
    expect(rozAware).toContain("(i.payment_data ->> 'amountDue') ~ '^[0-9]+(\\.[0-9]+)?$'");
    expect(rozAware).toContain("LEAST((i.payment_data ->> 'amountDue')::numeric, i.gross_total)");
    // Both the SELECT's amount_due and the WHERE's exclusion of fully-paid
    // rows must use this same due-amount CASE, not the plain gross_total.
    const dueCaseCount = rozAware.match(/WHEN i\.invoice_kind = 'final'/g)?.length ?? 0;
    expect(dueCaseCount).toBe(2);
    expect(rozAware).toMatch(/i\.paid_amount\s*<\s*\(\s*CASE/);
    expect(rozAware).not.toMatch(/i\.paid_amount\s*<\s*i\.gross_total/);
  });

  it('keeps every other 00126 safety predicate: app origin, PLN-only, accepted, and the same-tenant child guard', () => {
    expect(rozAware).toMatch(/i\.origin\s*=\s*'app'/);
    expect(rozAware).toMatch(/i\.ksef_status\s*=\s*'accepted'/);
    expect(rozAware).toMatch(/i\.currency IS NULL OR i\.currency\s*=\s*'PLN'/);
    const childPredicate = /AND NOT EXISTS \(\s*SELECT 1\s+FROM public\.invoices child\s+WHERE child\.tenant_id\s*=\s*i\.tenant_id\s+AND \(child\.parent_invoice_id\s*=\s*i\.id\s+OR i\.id\s*=\s*ANY\(child\.advance_invoice_ids\)\)\s*\)/.exec(rozAware);
    expect(childPredicate).not.toBeNull();
  });

  it('preserves security_invoker and the existing grants', () => {
    expect(rozAware).toMatch(/CREATE OR REPLACE VIEW public\.invoices_overdue\s+WITH\s*\(security_invoker\s*=\s*true\)/);
    expect(rozAware).toMatch(/REVOKE ALL ON public\.invoices_overdue FROM anon/);
    expect(rozAware).toMatch(/GRANT SELECT ON public\.invoices_overdue TO authenticated/);
  });

  it('rebinds the payment-status trigger onto the same name, timing and level — CREATE OR REPLACE, no DROP', () => {
    expect(rozAware).toMatch(
      /CREATE OR REPLACE TRIGGER trigger_update_payment_status\s+BEFORE INSERT OR UPDATE OF paid_amount, payment_due_date, gross_total, payment_data, invoice_kind\s+ON public\.invoices\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.update_invoice_payment_status\(\);/,
    );
    expect(rozAware).not.toMatch(/DROP TRIGGER/i);
  });

  it('keeps the update_invoice_payment_status function fail-safe: regex guard before the numeric cast', () => {
    expect(rozAware).toMatch(/CREATE OR REPLACE FUNCTION public\.update_invoice_payment_status\(\)/);
    expect(rozAware).toContain("v_amount_due_text ~ '^[0-9]+(\\.[0-9]+)?$'");
    expect(rozAware).toContain('v_due := LEAST(v_amount_due_text::numeric, NEW.gross_total)');
    // Non-final or malformed payment_data must fail safe to the full amount.
    expect(rozAware).toMatch(/ELSE\s*\n\s*v_due := NEW\.gross_total;/);
    // search_path lockdown carried over unchanged from 00073.
    expect(rozAware).toMatch(/LANGUAGE plpgsql\s*\n\s*SET search_path = ''/);
  });

  it('treats a ROZ fully covered by advances (amount due 0) as paid, not unpaid/overdue', () => {
    expect(rozAware).toContain("IF NEW.paid_amount = 0 AND NOT (NEW.invoice_kind = 'final' AND v_due = 0) THEN");
  });

  it('is purely additive: no DROP TABLE/COLUMN, TRUNCATE or DELETE FROM (outside comments)', () => {
    // Strip `--` line comments first — the migration's own prose names these
    // forbidden statements to explain why none of them appear in the SQL.
    const sqlOnly = rozAware.replace(/--.*$/gm, '');
    expect(sqlOnly).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sqlOnly).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/i);
    expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
