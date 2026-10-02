import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * AUD-41: klucze obce `created_by` bez ON DELETE blokowały usunięcie konta
 * (art. 17 RODO), a anonimizacja dziennika szła wcześniej i jest
 * nieodwracalna. Strażnik tekstu 00113 — na prawdziwej bazie sprawdza to
 * tests/rls-uprawnienia.test.ts w jobie RLS.
 */

const sql = readFileSync('supabase/migrations/00113_user_deletion_foreign_keys.sql', 'utf8');

describe('00113: usunięcie konta nie zatrzymuje się na kluczach obcych', () => {
  it.each([
    ['expenses', 'created_by', 'auth.users'],
    ['ocr_jobs', 'created_by', 'auth.users'],
    ['accountant_access', 'created_by_user_id', 'public.users'],
  ])('%s.%s → ON DELETE SET NULL', (table, column, target) => {
    expect(sql).toContain(
      `ADD CONSTRAINT ${table}_${column}_fkey\n  FOREIGN KEY (${column}) REFERENCES ${target}(id) ON DELETE SET NULL;`,
    );
  });

  it('kolumny autora mogą być puste (inaczej SET NULL wywróci usunięcie)', () => {
    expect(sql).toContain('ALTER TABLE public.expenses ALTER COLUMN created_by DROP NOT NULL;');
    expect(sql).toContain('ALTER TABLE public.ocr_jobs ALTER COLUMN created_by DROP NOT NULL;');
  });

  it('sprawdzenie blokad tylko dla service_role', () => {
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.gdpr_user_deletion_blockers(uuid) FROM PUBLIC, anon, authenticated;',
    );
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.gdpr_user_deletion_blockers(uuid) TO service_role;');
  });

  it('bez usuwania danych i tabel', () => {
    expect(sql).not.toMatch(/\b(TRUNCATE|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|FUNCTION|POLICY))\b/i);
    // Jedyne UPDATE: czyszczenie surowych payloadów odbić (AUD-81).
    expect(sql.match(/\bUPDATE\s+public\./gi)).toEqual(['UPDATE public.']);
    expect(sql).toContain('UPDATE public.email_bounces SET raw_payload = NULL WHERE raw_payload IS NOT NULL;');
  });
});
