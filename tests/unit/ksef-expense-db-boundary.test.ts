import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stageOne = readFileSync(
  join(process.cwd(), 'supabase/migrations/00100_ksef_expense_provenance_guard.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');
const stageTwo = readFileSync(
  join(process.cwd(), 'supabase/migrations/00101_ksef_expense_full_update_guard.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');

function functionBody(sql: string, name: string): string {
  const body = sql.match(new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\([^)]*\\)[\\s\\S]*?AS\\s+\\$\\$([\\s\\S]*?)\\$\\$\\s*;`,
    'i',
  ))?.[1];
  expect(body).toBeDefined();
  return body!;
}

describe('KSeF expense database boundary', () => {
  it('stage 1 retains the partial guard while installing the audited review path', () => {
    expect(stageOne).toMatch(/REVOKE\s+INSERT\s+ON\s+TABLE\s+public\.expenses\s+FROM\s+authenticated\s*;/i);
    expect(stageOne).toMatch(/CREATE\s+TRIGGER\s+a_guard_ksef_expense_provenance\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.expenses/i);
    const body = functionBody(stageOne, 'guard_ksef_expense_provenance');
    expect(body).toMatch(/TG_OP\s*=\s*'DELETE'[\s\S]*?OLD\.source\s*=\s*'ksef_inbox'[\s\S]*?OLD\.ksef_invoice_id\s+IS\s+NOT\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(body).toMatch(/NEW\.source\s+IS\s+DISTINCT\s+FROM\s+OLD\.source/i);
    expect(body).toMatch(/NEW\.ksef_invoice_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.ksef_invoice_id/i);
    expect(body).toMatch(/NEW\.ocr_extracted_data\s+IS\s+DISTINCT\s+FROM\s+OLD\.ocr_extracted_data/i);
    expect(body).not.toContain('KSeF expense review is server-managed');
  });

  it('stage 2 denies every direct client UPDATE of a KSeF row without blocking ordinary expenses', () => {
    const body = functionBody(stageTwo, 'guard_ksef_expense_provenance');
    expect(stageTwo).toMatch(/to_regprocedure\('public\.review_ksef_expense\(uuid,uuid,uuid,timestamptz,jsonb\)'\)\s+IS\s+NULL/i);
    expect(stageTwo).toMatch(/pg_catalog\.pg_trigger[\s\S]*?t\.tgname\s*=\s*'a_guard_ksef_expense_provenance'/i);
    expect(stageTwo).toMatch(/SECURITY\s+INVOKER/i);
    expect(body).toMatch(/current_user\s+NOT\s+IN\s*\(\s*'authenticated'\s*,\s*'anon'\s*\)/i);
    expect(body).toMatch(/TG_OP\s*=\s*'DELETE'[\s\S]*?OLD\.source\s*=\s*'ksef_inbox'[\s\S]*?OLD\.ksef_invoice_id\s+IS\s+NOT\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(body).toMatch(/IF\s+OLD\.source\s*=\s*'ksef_inbox'\s+OR\s+OLD\.ksef_invoice_id\s+IS\s+NOT\s+NULL\s+THEN\s+RAISE\s+EXCEPTION\s+'KSeF expense review is server-managed'[\s\S]*?ERRCODE\s*=\s*'42501'/i);
    expect(body).toMatch(/NEW\.source\s+IS\s+DISTINCT\s+FROM\s+OLD\.source/i);
    expect(body).toMatch(/NEW\.ksef_invoice_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.ksef_invoice_id/i);
    expect(body).toMatch(/RETURN\s+NEW\s*;/i);
    expect(stageTwo).not.toMatch(/REVOKE\s+UPDATE\s+ON\s+TABLE\s+public\.expenses/i);
  });

  it('allows only the service role to call an authenticated, tenant-bound, atomically audited RPC', () => {
    const body = functionBody(stageOne, 'review_ksef_expense');
    expect(stageOne).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.review_ksef_expense\([\s\S]*?RETURNS\s+uuid\s+LANGUAGE\s+plpgsql\s+SECURITY\s+INVOKER\s+SET\s+search_path\s*=\s*''/i);
    expect(body).toMatch(/current_user\s*<>\s*'service_role'/i);
    expect(body).toMatch(/PERFORM\s+1\s+FROM\s+public\.memberships[\s\S]*?m\.organization_id\s*=\s*p_tenant_id[\s\S]*?m\.user_id\s*=\s*p_actor_user_id[\s\S]*?m\.status\s*=\s*'active'[\s\S]*?FOR\s+SHARE/i);
    expect(body).toMatch(/FOR\s+v_key,\s*v_value\s+IN\s+SELECT\s+key,\s*value\s+FROM\s+jsonb_each\(p_patch\)/i);
    expect(body).toMatch(/e\.tenant_id\s*=\s*p_tenant_id[\s\S]*?e\.updated_at\s*=\s*p_expected_updated_at[\s\S]*?e\.source\s*=\s*'ksef_inbox'[\s\S]*?e\.ksef_invoice_id\s+IS\s+NOT\s+NULL[\s\S]*?FOR\s+UPDATE/i);
    expect(body).toMatch(/UPDATE\s+public\.expenses\s+AS\s+e[\s\S]*?RETURNING\s+e\.\*\s+INTO\s+v_after[\s\S]*?INSERT\s+INTO\s+public\.audit_logs/i);
    expect(body).toMatch(/v_currency\s+IS\s+NULL\s+AND\s*\(v_after\.is_reviewed\s+OR\s+v_after\.is_deductible\)[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(body).toMatch(/WHEN\s+v_currency\s*=\s*'PLN'\s+THEN\s+'expense\.reviewed'[\s\S]*?WHEN\s+v_after\.is_reviewed\s+THEN\s+'expense\.foreign_currency_reviewed'[\s\S]*?ELSE\s+'expense\.foreign_currency_excluded'/i);
    expect(body).toMatch(/'currency',\s*coalesce\(v_currency,\s*'unknown'\)/i);
    expect(body).toMatch(/'issue_date'\)\s*!~\s*'\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'/i);
    const setBody = body.match(/UPDATE\s+public\.expenses\s+AS\s+e\s+SET([\s\S]*?)\s+WHERE\s+e\.id/i)?.[1];
    expect(setBody).toBeDefined();
    for (const forbidden of ['tenant_id', 'source', 'ksef_invoice_id', 'ocr_extracted_data', 'created_by']) {
      expect(setBody).not.toMatch(new RegExp(`\\b${forbidden}\\s*=`));
    }
    expect(body).toMatch(/'currency',\s*coalesce\(v_currency,\s*'unknown'\)[\s\S]*?'includedInKpir',\s*v_after\.is_deductible[\s\S]*?'fields',\s*to_jsonb\(v_fields\)/i);
    expect(stageOne).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.review_ksef_expense\([\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated,\s*service_role\s*;/i);
    expect(stageOne).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.review_ksef_expense\([\s\S]*?TO\s+service_role\s*;/i);
    expect(stageOne).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;/i);
  });

  it('retains accepted invoice currency immutability in the existing migration', () => {
    const acceptedGuard = readFileSync(
      join(process.cwd(), 'supabase/migrations/00073_payment_evidence_boundary.sql'),
      'utf8',
    ).replace(/--[^\n]*/g, '');
    expect(acceptedGuard).toMatch(/OLD\.ksef_status\s*=\s*'accepted'[\s\S]*?NEW\.currency\s+IS\s+DISTINCT\s+FROM\s+OLD\.currency/i);
  });
});
