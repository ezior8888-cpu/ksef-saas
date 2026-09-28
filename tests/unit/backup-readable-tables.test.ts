import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SKIP_TABLES } from '@/lib/backup/snapshot-tables';

/**
 * Nocny backup (`cron.daily-db-snapshot`) czyta KAŻDĄ tabelę `public` jako
 * `service_role` i wywraca się na pierwszej, której przeczytać nie może.
 *
 * Tak było od wydania 25.09 do 28.09: 00078 i 00080 odebrały `service_role`
 * wszystkie prawa do czterech tabel obsługiwanych wyłącznie przez RPC
 * (słusznie, jeśli chodzi o zapis), a razem z zapisem poszedł odczyt.
 * Trzy noce bez kopii, zauważone dopiero w logach. Naprawa: 00098.
 *
 * Ten strażnik odtwarza z migracji, kto na koniec może czytać którą tabelę,
 * i wymaga odczytu `service_role` dla każdej tabeli spoza `SKIP_TABLES`.
 * Świadomie wąski: śledzi tylko `service_role` i tylko tabele, nie widoki.
 */

const KATALOG = join(process.cwd(), 'supabase/migrations');

/** Treść bez komentarzy i bez ciał funkcji (`$$ … $$`), podzielona na polecenia. */
function polecenia(sql: string): string[] {
  const czysty = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ');
  return czysty.split(';').map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** `public.x`, `"x"`, `x` → `x`; inny schemat → null. */
function tabelaPublic(nazwa: string): string | null {
  const n = nazwa.trim().replace(/"/g, '');
  const kropka = n.lastIndexOf('.');
  if (kropka >= 0 && n.slice(0, kropka).toLowerCase() !== 'public') return null;
  return (kropka >= 0 ? n.slice(kropka + 1) : n).toLowerCase();
}

/** Czy lista uprawnień obejmuje pełny odczyt tabeli (nie kolumnowy). */
function dotyczyOdczytu(uprawnienia: string): boolean {
  return uprawnienia
    .split(',')
    .map((u) => u.trim().toUpperCase())
    .some((u) => u === 'ALL' || u === 'ALL PRIVILEGES' || u === 'SELECT');
}

/** Stan końcowy: tabela → czy `service_role` może ją czytać. */
function odczytServiceRole(pominPliki: ReadonlySet<string> = new Set()): Map<string, boolean> {
  const stan = new Map<string, boolean>();
  const pliki = readdirSync(KATALOG).filter((f) => f.endsWith('.sql') && !pominPliki.has(f)).sort();

  for (const plik of pliki) {
    for (const p of polecenia(readFileSync(join(KATALOG, plik), 'utf8'))) {
      const utworzona = /^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?([\w."]+)/i.exec(p);
      if (utworzona) {
        const t = tabelaPublic(utworzona[1]!);
        // Supabase daje service_role domyślnie komplet praw do nowych tabel.
        if (t && !stan.has(t)) stan.set(t, true);
        continue;
      }

      const usunieta = /^DROP TABLE (?:IF EXISTS )?(.+?)(?: CASCADE| RESTRICT)?$/i.exec(p);
      if (usunieta) {
        for (const n of usunieta[1]!.split(',')) {
          const t = tabelaPublic(n);
          if (t) stan.delete(t);
        }
        continue;
      }

      const zmianaNazwy = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w."]+) RENAME TO ([\w"]+)$/i.exec(p);
      if (zmianaNazwy) {
        const stara = tabelaPublic(zmianaNazwy[1]!);
        const nowa = tabelaPublic(zmianaNazwy[2]!);
        if (stara && nowa && stan.has(stara)) {
          stan.set(nowa, stan.get(stara)!);
          stan.delete(stara);
        }
        continue;
      }

      const prawo = /^(GRANT|REVOKE) (?!GRANT OPTION FOR)(.+?) ON (?:TABLE )?(.+?) (TO|FROM) (.+)$/i.exec(p);
      if (!prawo) continue;
      const [, rodzaj, uprawnienia, obiekty, , role] = prawo;
      if (!role!.split(',').some((r) => r.trim().toLowerCase() === 'service_role')) continue;
      if (!dotyczyOdczytu(uprawnienia!)) continue;
      const nadaje = rodzaj!.toUpperCase() === 'GRANT';

      if (/^ALL TABLES IN SCHEMA public$/i.test(obiekty!.trim())) {
        for (const t of stan.keys()) stan.set(t, nadaje);
        continue;
      }
      if (/^(FUNCTION|FUNCTIONS|SEQUENCE|SEQUENCES|SCHEMA|TYPE|ROUTINE|PROCEDURE|ALL )/i.test(obiekty!.trim())) continue;

      for (const n of obiekty!.split(',')) {
        const t = tabelaPublic(n);
        if (t && stan.has(t)) stan.set(t, nadaje);
      }
    }
  }
  return stan;
}

function nieczytelne(stan: Map<string, boolean>): string[] {
  return [...stan]
    .filter(([t, czyta]) => !czyta && !SKIP_TABLES.has(t))
    .map(([t]) => t)
    .sort();
}

describe('nocny backup czyta każdą tabelę', () => {
  it('service_role może czytać każdą tabelę public spoza SKIP_TABLES', () => {
    expect(
      nieczytelne(odczytServiceRole()),
      'Snapshot (lib/backup/db-snapshot.ts) czyta każdą tabelę jako service_role. ' +
        'Zabierz zapis, zostaw GRANT SELECT … TO service_role — albo dopisz tabelę do SKIP_TABLES z uzasadnieniem.',
    ).toEqual([]);
  });

  it('bez 00098 wskazuje dokładnie cztery tabele, które wywracały backup 26–28.09', () => {
    // Zgodne z produkcją przed 00098 (has_table_privilege, 28.09).
    expect(nieczytelne(odczytServiceRole(new Set(['00098_backup_read_stripe_service_tables.sql'])))).toEqual([
      'stripe_financial_case_refs',
      'stripe_financial_case_reopenings',
      'stripe_financial_case_reviews',
      'stripe_subscription_sync_leases',
    ]);
  });

  it('widzi jawne nadanie po odebraniu wszystkiego (00080: stripe_financial_cases)', () => {
    expect(odczytServiceRole().get('stripe_financial_cases')).toBe(true);
  });

  it('skan obejmuje rzeczywisty schemat', () => {
    expect(odczytServiceRole().size).toBeGreaterThan(50);
  });
});
