import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bezKomentarzyTs, naPoziomie, plikiKodu, toPosix } from '../helpers/schema-z-migracji';

/**
 * Każde `.rpc('nazwa', { … })` trafia w funkcję, która ISTNIEJE w migracjach,
 * z argumentami o właściwych nazwach i bez brakujących wymaganych.
 *
 * PostgREST wybiera funkcję po nazwie I zestawie nazw argumentów. Literówka
 * w którymkolwiek kończy się na produkcji błędem PGRST202, a TypeScript tego
 * nie widzi (klient admina jest nieotypowany). Stąd porównanie z migracjami.
 *
 * Stan na 25.09.2026: 16 wywołań, wszystkie zgodne — w tym pięć funkcji
 * Stripe (webhooki, synchronizacja subskrypcji) z wydania.
 */

interface Param {
  nazwa: string;
  domyslny: boolean;
}

/** Nazwa funkcji → jej definicje (przeciążenia) z listą parametrów. */
function funkcjeZMigracji(): Map<string, Param[][]> {
  const katalog = join(process.cwd(), 'supabase/migrations');
  const out = new Map<string, Param[][]>();

  for (const plik of readdirSync(katalog).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(katalog, plik), 'utf8').replace(/--[^\n]*/g, '');

    for (const m of sql.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
      out.delete(m[1]!.toLowerCase());
    }

    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi)) {
      const nazwa = m[1]!.toLowerCase();
      let i = m.index! + m[0].length;
      const start = i;
      let glebokosc = 1;
      while (i < sql.length && glebokosc > 0) {
        if (sql[i] === '(') glebokosc++;
        else if (sql[i] === ')') glebokosc--;
        i++;
      }

      const params: Param[] = naPoziomie(sql.slice(start, i - 1))
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const bezTrybu = p.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, '');
          const n = bezTrybu.match(/^"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i);
          return { nazwa: n ? n[1]!.toLowerCase() : '', domyslny: /\bDEFAULT\b|=/i.test(p) };
        });

      // Ta sama lista nazw = ta sama sygnatura (zastąpienie); inna = przeciążenie.
      const klucz = params.map((p) => p.nazwa).join(',');
      const dotychczas = out.get(nazwa) ?? [];
      out.set(nazwa, [
        ...dotychczas.filter((d) => d.map((p) => p.nazwa).join(',') !== klucz),
        params,
      ]);
    }
  }

  return out;
}

/** Klucze najwyższego poziomu obiektu `{ … }` zaczynającego się na pozycji `od`. */
function kluczeObiektu(tekst: string, od: number): string[] {
  if (tekst[od] !== '{') return [];
  const klucze: string[] = [];
  let glebokosc = 0;
  let biezacy = '';

  for (let i = od; i < tekst.length; i++) {
    const z = tekst[i]!;
    if ('{[('.includes(z)) {
      glebokosc++;
      if (glebokosc === 1) continue;
    }
    if ('}])'.includes(z)) {
      glebokosc--;
      if (glebokosc === 0) {
        klucze.push(biezacy);
        break;
      }
    }
    if (glebokosc === 1 && z === ',') {
      klucze.push(biezacy);
      biezacy = '';
      continue;
    }
    if (glebokosc === 1) biezacy += z;
  }

  return klucze
    .map((k) => k.trim())
    .filter((k) => k && !k.startsWith('...'))
    .map((k) => (k.match(/^['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/) ?? [])[1] ?? '')
    .filter(Boolean)
    .map((k) => k.toLowerCase());
}

interface Wywolanie {
  opis: string;
  zgodne: boolean;
}

function wywolania(): Wywolanie[] {
  const funkcje = funkcjeZMigracji();
  const out: Wywolanie[] = [];

  for (const dir of ['lib', 'app']) {
    for (const f of plikiKodu(join(process.cwd(), dir))) {
      const kod = bezKomentarzyTs(readFileSync(f, 'utf8'));
      const plik = toPosix(f).replace(toPosix(process.cwd()) + '/', '');

      for (const m of kod.matchAll(/\.rpc\(\s*'([a-z_0-9]+)'\s*(?:,\s*)?/g)) {
        const nazwa = m[1]!;
        const linia = kod.slice(0, m.index!).split('\n').length;
        const gdzie = `${plik}:${linia} ${nazwa}`;
        const definicje = funkcje.get(nazwa);

        if (!definicje) {
          out.push({ opis: `${gdzie} — brak funkcji w migracjach`, zgodne: false });
          continue;
        }

        const klucze = kluczeObiektu(kod, m.index! + m[0].length);
        const zgodne = definicje.some((d) => {
          const nazwy = new Set(d.map((p) => p.nazwa));
          const znane = klucze.every((k) => nazwy.has(k));
          const wymagane = d
            .filter((p) => p.nazwa && !p.domyslny)
            .every((p) => klucze.includes(p.nazwa));
          return znane && wymagane;
        });

        const sygnatury = definicje
          .map((d) => `(${d.map((p) => p.nazwa + (p.domyslny ? '?' : '')).join(', ')})`)
          .join(' | ');
        out.push({ opis: `${gdzie}{${klucze.join(', ')}} vs ${sygnatury}`, zgodne });
      }
    }
  }

  return out;
}

describe('wywołania RPC zgodne z funkcjami w bazie', () => {
  it('skan widzi wywołania', () => {
    expect(wywolania().length).toBeGreaterThanOrEqual(10);
  });

  it('każde wywołanie trafia w istniejącą funkcję z właściwymi argumentami', () => {
    expect(
      wywolania()
        .filter((w) => !w.zgodne)
        .map((w) => w.opis),
      'PostgREST wybiera funkcję po nazwie i nazwach argumentów — inaczej PGRST202 na produkcji.',
    ).toEqual([]);
  });
});
