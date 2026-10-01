import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/00100_ksef_expense_provenance_guard.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');

describe('KSeF expense database boundary', () => {
  it('reserves expense creation for the server and guards source evidence on update and delete', () => {
    expect(migration).toMatch(/REVOKE\s+INSERT\s+ON\s+TABLE\s+public\.expenses\s+FROM\s+authenticated\s*;/i);
    expect(migration).toMatch(/CREATE\s+TRIGGER\s+a_guard_ksef_expense_provenance\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.expenses/i);
    expect(migration).toMatch(/SECURITY\s+INVOKER/i);
    expect(migration).toMatch(/current_user\s+NOT\s+IN\s*\(\s*'authenticated'\s*,\s*'anon'\s*\)/i);

    const body = migration.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.guard_ksef_expense_provenance\(\)[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$\s*;/i)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/TG_OP\s*=\s*'DELETE'[\s\S]*?OLD\.source\s*=\s*'ksef_inbox'[\s\S]*?OLD\.ksef_invoice_id\s+IS\s+NOT\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(body).toMatch(/NEW\.source\s+IS\s+DISTINCT\s+FROM\s+OLD\.source/i);
    expect(body).toMatch(/NEW\.ksef_invoice_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.ksef_invoice_id/i);
    expect(body).toMatch(/NEW\.ocr_extracted_data\s+IS\s+DISTINCT\s+FROM\s+OLD\.ocr_extracted_data/i);
    expect(body).toMatch(/ERRCODE\s*=\s*'42501'/i);
  });

  it('retains accepted invoice currency immutability in the existing migration', () => {
    const acceptedGuard = readFileSync(
      join(process.cwd(), 'supabase/migrations/00073_payment_evidence_boundary.sql'),
      'utf8',
    ).replace(/--[^\n]*/g, '');
    expect(acceptedGuard).toMatch(/OLD\.ksef_status\s*=\s*'accepted'[\s\S]*?NEW\.currency\s+IS\s+DISTINCT\s+FROM\s+OLD\.currency/i);
  });
});
