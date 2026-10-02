import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * AUD-10 (00124): przejęcie wysyłki do KSeF z dzierżawą. Strażnik tekstu
 * migracji — zachowanie na prawdziwej bazie sprawdza tests/rls-uprawnienia.test.ts.
 */

const sql = readFileSync('supabase/migrations/00124_ksef_send_claim.sql', 'utf8');

describe('00124: przejęcie wysyłki KSeF', () => {
  it('funkcja przejęcia tylko dla serwisu', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_ksef_send(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_ksef_send(uuid, uuid, text, integer) TO service_role;');
  });

  it('wolna, ta sama próba albo wygasła dzierżawa — nigdy przyjęta ani przychodząca', () => {
    expect(sql).toContain("AND direction = 'outgoing'");
    expect(sql).toContain("AND ksef_status IS DISTINCT FROM 'accepted'");
    expect(sql).toContain('submitted_to_ksef_at IS NULL');
    expect(sql).toContain('(p_owner IS NOT NULL AND ksef_send_owner = p_owner)');
    expect(sql).toContain('submitted_to_ksef_at < v_now - pg_catalog.make_interval(secs => p_lease_seconds)');
  });

  it('klient nie ustawia właściciela przejęcia; bez zmian danych', () => {
    expect(sql).toContain("RAISE EXCEPTION 'KSeF send claim is server-managed'");
    const outsideBodies = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
    expect(outsideBodies).not.toMatch(/\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.|DROP\s+(TABLE|COLUMN))\b/i);
  });
});
