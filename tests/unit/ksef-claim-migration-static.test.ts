import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/00086_ksef_certificate_claim_guard.sql'),
  'utf8',
);

describe('00086 privileged KSeF provenance writes', () => {
  it('revokes tenant-user DML on Offline24 and UPO artifacts', () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.ksef_offline_queue\s+FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.upo_receipts\s+FROM PUBLIC, anon, authenticated;/);
  });

  it('guards accepted status and queue replay in the database', () => {
    expect(migration).toMatch(/OLD\.ksef_status = 'accepted' AND NEW\.ksef_status IS DISTINCT FROM 'accepted'/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF ksef_environment, ksef_status, ksef_accepted_at\s+ON public\.invoices/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF ksef_environment, status\s+ON public\.ksef_offline_queue/);
  });

  it('freezes accepted invoice lines and the official acceptance timestamp against tenant-user DML', () => {
    expect(migration).toMatch(/NEW\.ksef_accepted_at IS DISTINCT FROM OLD\.ksef_accepted_at/);
    expect(migration).toMatch(/current_user NOT IN \('anon', 'authenticated'\)/);
    expect(migration).toMatch(/i\.id = OLD\.invoice_id AND i\.ksef_status = 'accepted'/);
    expect(migration).toMatch(/i\.id = NEW\.invoice_id AND i\.ksef_status = 'accepted'/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.invoice_line_items/);
  });
});
