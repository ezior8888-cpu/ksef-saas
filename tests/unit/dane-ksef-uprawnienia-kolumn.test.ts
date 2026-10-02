import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * AUD-103: każdy członek firmy mógł odczytać `tenants.ksef_credentials_encrypted`
 * kluczem użytkownika (RLS wpuszcza do wiersza, a uprawnień kolumnowych nie
 * było). Teraz strony pytają o `has_ksef_credentials` (00111), odszyfrowanie
 * idzie kluczem serwisowym, a 00112 odbiera rolom klienckim SELECT tej kolumny.
 */

const read = (p: string) => readFileSync(p, 'utf8');

describe('dane KSeF poza zasięgiem klienta', () => {
  it.each([
    'app/(dashboard)/settings/ksef/page.tsx',
    'app/(dashboard)/import-danych/page.tsx',
    'app/onboarding/import-source/page.tsx',
  ])('%s: tylko flaga obecności, nie zaszyfrowany blob', (p) => {
    const src = read(p);
    expect(src).not.toContain('ksef_credentials_encrypted');
    expect(src).toContain('has_ksef_credentials');
  });

  it('kolejkowanie wysyłki czyta blob kluczem serwisowym', () => {
    const src = read('lib/invoices/ksef-submit-enqueue.ts');
    expect(src).toMatch(/createAdminClient\(\)\s*\.from\('tenants'\)\s*\.select\('ksef_credentials_encrypted'\)/);
  });

  it('00112 odbiera SELECT kolumny rolom klienckim, resztę kolumn przyznaje jawnie', () => {
    const sql = read('supabase/migrations/00112_tenant_credentials_column_privileges.sql');
    expect(sql).toContain('REVOKE SELECT ON public.tenants FROM anon, authenticated;');
    expect(sql).toContain("column_name <> 'ksef_credentials_encrypted'");
  });

  it('każda nowa kolumna tenants po 00112 dostaje jawny GRANT SELECT (inaczej klient jej nie przeczyta)', () => {
    const dir = 'supabase/migrations';
    const later = readdirSync(dir).filter((f) => /^\d{5}_/.test(f) && f > '00112');
    for (const file of later) {
      const sql = read(`${dir}/${file}`);
      const added = [...sql.matchAll(/ALTER TABLE (?:public\.)?tenants[\s\S]*?ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1]);
      for (const col of added) {
        expect(sql, `${file}: kolumna ${col}`).toMatch(new RegExp(`GRANT SELECT \\([^)]*\\b${col}\\b[^)]*\\) ON (?:public\\.)?tenants TO authenticated`, 'i'));
      }
    }
  });
});
