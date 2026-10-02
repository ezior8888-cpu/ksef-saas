import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// AUD-63 (B2): `disableSignups` zamyka rejestrację także w samym GoTrue —
// konto powstaje w `/auth/v1/signup` i przy pierwszym logowaniu Google,
// zanim aplikacja cokolwiek zobaczy. Hook „before user created” odmawia,
// gdy flaga jest włączona. Lokalnie nie ma Postgresa, więc test czyta
// migrację: to ona jest kontraktem z GoTrue.

const FILE = join(process.cwd(), 'supabase/migrations/00102_signup_gate_hook.sql');
const sql = () => readFileSync(FILE, 'utf8');
/** Bez komentarzy — asercje dotyczą wykonywanego SQL, nie opisu. */
const code = () => sql().replace(/--.*$/gm, '');

describe('migracja 00102 — hook rejestracji w GoTrue', () => {
  it('istnieje', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('funkcja ma sygnaturę hooka GoTrue: (event jsonb) → jsonb', () => {
    expect(code()).toMatch(
      /CREATE OR REPLACE FUNCTION public\.hook_before_user_created\(event jsonb\)\s+RETURNS jsonb/i,
    );
  });

  it('czyta disableSignups z global_feature_flags i odmawia błędem 403', () => {
    const body = code();
    expect(body).toMatch(/FROM public\.global_feature_flags/i);
    expect(body).toMatch(/flag = 'disableSignups'/);
    expect(body).toMatch(/'http_code',\s*403/);
    expect(body).toMatch(/RETURN '\{\}'::jsonb/);
  });

  it('brak wiersza flagi = rejestracja otwarta (jak getGlobalFlagForExecution)', () => {
    expect(code()).toMatch(/IF coalesce\(v_closed, false\) THEN/i);
  });

  it('działa z prawami właściciela tabeli (RLS bez polityk) i z pustym search_path', () => {
    const body = code();
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = ''/);
  });

  it('wywołać może tylko GoTrue (supabase_auth_admin), nie anon ani authenticated', () => {
    const body = code();
    expect(body).toMatch(
      /REVOKE ALL ON FUNCTION public\.hook_before_user_created\(jsonb\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(body).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.hook_before_user_created\(jsonb\) TO supabase_auth_admin;/,
    );
  });

  it('nie zmienia danych', () => {
    expect(code()).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
  });
});
