import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bezKomentarzyTs, naPoziomie, plikiKodu, toPosix } from '../helpers/schema-z-migracji';

/**
 * Każdy `upsert(…, { onConflict: 'a,b' })` trafia w UNIKALNY klucz z migracji.
 *
 * Bez takiego klucza Postgres odrzuca całe zapytanie („there is no unique or
 * exclusion constraint matching the ON CONFLICT specification”). Jeśli kod
 * połyka błąd, zapis po cichu nie następuje nigdy. Częściowy indeks unikalny
 * (`… WHERE …`) się NIE liczy — PostgREST nie przekaże jego warunku.
 *
 * Tło (25.09.2026): `idx_invoices_ksef_number_unique` nazywał się „unique”,
 * a był zwykłym indeksem. Nazwa nie jest dowodem — dowodem jest DDL.
 * Stan na ten dzień: 22 upserty, wszystkie trafiają w istniejący klucz.
 */

const ROOT = process.cwd();
const zbior = (kolumny: string) =>
  kolumny
    .split(',')
    .map((k) => k.replace(/["\s]/g, '').toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
const nazwaTabeli = (t: string) => t.replace(/"/g, '').toLowerCase().replace(/^public\./, '');

interface Klucze {
  pelne: Map<string, Set<string>>;
  czesciowe: Map<string, Set<string>>;
}

function kluczeZMigracji(): Klucze {
  const pelne = new Map<string, Set<string>>();
  const czesciowe = new Map<string, Set<string>>();
  const dodaj = (m: Map<string, Set<string>>, tabela: string, kolumny: string) => {
    const t = nazwaTabeli(tabela);
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(zbior(kolumny));
  };

  const katalog = join(ROOT, 'supabase/migrations');
  for (const plik of readdirSync(katalog).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(katalog, plik), 'utf8').replace(/--[^\n]*/g, '');

    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi)) {
      let i = m.index! + m[0].length;
      const start = i;
      let glebokosc = 1;
      while (i < sql.length && glebokosc > 0) {
        if (sql[i] === '(') glebokosc++;
        else if (sql[i] === ')') glebokosc--;
        i++;
      }
      for (const czesc of naPoziomie(sql.slice(start, i - 1)).map((c) => c.trim())) {
        const tabelowe = czesc.match(
          /^(?:CONSTRAINT\s+\S+\s+)?(?:PRIMARY\s+KEY|UNIQUE)(?:\s+NULLS\s+NOT\s+DISTINCT)?\s*\(([^)]+)\)/i,
        );
        if (tabelowe) {
          dodaj(pelne, m[1]!, tabelowe[1]!);
          continue;
        }
        const kolumna = czesc.match(/^"?(\w+)"?\s+\w/);
        if (kolumna && /\b(PRIMARY\s+KEY|UNIQUE)\b/i.test(czesc)) dodaj(pelne, m[1]!, kolumna[1]!);
      }
    }

    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([\w."]+)\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?(?:PRIMARY\s+KEY|UNIQUE)(?:\s+NULLS\s+NOT\s+DISTINCT)?\s*\(([^)]+)\)/gi,
    )) {
      dodaj(pelne, m[1]!, m[2]!);
    }

    for (const m of sql.matchAll(
      /CREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+ON\s+(?:ONLY\s+)?([\w."]+)\s*(?:USING\s+\w+\s*)?\(([^;]*?)\)\s*(WHERE[^;]*)?;/gi,
    )) {
      if (m[2]!.includes('(')) continue; // indeks na wyrażeniu — nie dla onConflict
      dodaj(m[3] ? czesciowe : pelne, m[1]!, m[2]!);
    }
  }
  return { pelne, czesciowe };
}

const KLUCZE = kluczeZMigracji();

interface Upsert {
  gdzie: string;
  tabela: string;
  cel: string;
}

function upserty(): Upsert[] {
  const out: Upsert[] = [];
  for (const dir of ['lib', 'app', 'components']) {
    for (const f of plikiKodu(join(ROOT, dir))) {
      const plik = toPosix(f).replace(toPosix(ROOT) + '/', '');
      if (/\.test\.tsx?$/.test(plik)) continue;
      const kod = bezKomentarzyTs(readFileSync(f, 'utf8'));
      for (const m of kod.matchAll(/onConflict:\s*'([^']+)'/g)) {
        const przed = kod.slice(Math.max(0, m.index! - 1500), m.index!);
        const froms = [...przed.matchAll(/\.from\(\s*'(\w+)'\s*\)/g)];
        out.push({
          gdzie: `${plik}:${kod.slice(0, m.index!).split('\n').length}`,
          tabela: froms.length ? froms[froms.length - 1]![1]! : '?',
          cel: zbior(m[1]!),
        });
      }
    }
  }
  return out;
}

describe('upsert trafia w unikalny klucz', () => {
  it('parser zna klucze: PK w kolumnie, UNIQUE w tabeli, indeks unikalny i częściowy', () => {
    expect(KLUCZE.pelne.get('invoices')?.has('id')).toBe(true);
    expect(KLUCZE.pelne.get('flo_decisions')?.has('kind,tenant_id')).toBe(true);
    // Zwykły indeks nie jest kluczem, nawet jeśli nazywa się „…_unique”.
    expect(KLUCZE.pelne.get('invoices')?.has('ksef_number')).toBe(false);
  });

  it('skan widzi upserty', () => {
    expect(upserty().length).toBeGreaterThanOrEqual(20);
  });

  it('każdy onConflict ma w bazie pełny (nie częściowy) klucz unikalny', () => {
    const zle = upserty()
      .filter((u) => !KLUCZE.pelne.get(u.tabela)?.has(u.cel))
      .map((u) => {
        const czesciowy = KLUCZE.czesciowe.get(u.tabela)?.has(u.cel) ? ' (jest tylko CZĘŚCIOWY indeks)' : '';
        return `${u.gdzie} ${u.tabela}(${u.cel})${czesciowy}`;
      });
    expect(
      zle,
      'ON CONFLICT bez pasującego klucza unikalnego — Postgres odrzuci cały zapis.',
    ).toEqual([]);
  });
});
