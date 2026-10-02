import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * Strażnik tekstu migracji 00103/00104 (pełna weryfikacja na bazie:
 * tests/rls-uprawnienia.test.ts w jobie RLS). Supabase nadaje EXECUTE
 * rolom anon/authenticated jawnie — samo `FROM PUBLIC` nic nie odbiera
 * (AUD-30, AUD-64), a rolę właściciela nadaje i odbiera tylko właściciel
 * (AUD-29).
 */

const m103 = readFileSync('supabase/migrations/00103_org_role_guards.sql', 'utf8');
const m104 = readFileSync('supabase/migrations/00104_service_function_grants.sql', 'utf8');
const m106 = readFileSync('supabase/migrations/00106_org_rpc_public_revoke.sql', 'utf8');

describe('migracje uprawnień', () => {
  it.each([
    'cleanup_old_audit_logs(integer)',
    'auth_email_registered(text)',
    'refresh_dashboard_materialized_views()',
    'increment_push_failed_count(uuid)',
  ])('%s: EXECUTE odebrane anon i authenticated', (fn) => {
    expect(m104).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
    expect(m104).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
  });

  it('owner nadaje tylko owner, właściciela usuwa tylko owner', () => {
    expect(m103).toContain("IF p_role = 'owner' AND NOT public.has_org_role(v_req.organization_id, 'owner') THEN");
    expect(m103).toContain("IF v_mem.role = 'owner' AND NOT public.has_org_role(v_mem.organization_id, 'owner') THEN");
  });

  it('RPC organizacji bez wywołania przez PUBLIC (00106)', () => {
    expect(m106).toContain('REVOKE EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) FROM PUBLIC, anon;');
    expect(m106).toContain('REVOKE EXECUTE ON FUNCTION public.revoke_membership(UUID) FROM PUBLIC, anon;');
  });

  it('bez operacji na danych poza ciałami funkcji', () => {
    for (const sql of [m103, m104, m106]) {
      const outsideBodies = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
      expect(outsideBodies).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.)/i);
    }
  });
});
