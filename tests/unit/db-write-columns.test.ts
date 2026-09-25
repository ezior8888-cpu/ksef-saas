import { describe, expect, it } from 'vitest';

import { lancuchyZapytan, schematZMigracji } from '../helpers/schema-z-migracji';

/**
 * Zapisy (`insert`, `update`, `upsert`) trafiają w kolumny, które ISTNIEJĄ.
 *
 * Zapis z kolumną, której nie ma, PostgREST odrzuca w całości. Jeśli kod
 * połyka błąd — a `logAudit` robi to celowo, żeby awaria audytu nie
 * przewracała głównej operacji — dane po prostu znikają. Dla dziennika
 * audytu, rozliczeń czy zgód to nie jest drobny błąd.
 *
 * Sprawdzamy WYŁĄCZNIE obiekty zapisane dosłownie w wywołaniu
 * (`.insert({ a: 1 })`). Zmiennych i rozwinięć (`...patch`) nie oceniamy —
 * lepiej nie zgłosić czegoś wątpliwego niż krzyczeć na poprawny kod.
 */

const SCHEMAT = schematZMigracji();

/** Klucze najwyższego poziomu dosłownego obiektu `{ … }` od pozycji `od`. */
function kluczeObiektu(tekst: string, od: number): string[] | null {
  if (tekst[od] !== '{') return null;
  const klucze: string[] = [];
  let glebokosc = 0;
  let biezacy = '';
  let wNapisie: string | null = null;

  for (let i = od; i < tekst.length; i++) {
    const z = tekst[i]!;
    if (wNapisie) {
      if (z === wNapisie && tekst[i - 1] !== '\\') wNapisie = null;
      if (glebokosc === 1) biezacy += z;
      continue;
    }
    if (z === "'" || z === '"' || z === '`') {
      wNapisie = z;
      if (glebokosc === 1) biezacy += z;
      continue;
    }
    if (z === '{' || z === '[' || z === '(') {
      glebokosc++;
      if (glebokosc === 1) continue;
    }
    if (z === '}' || z === ']' || z === ')') {
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
    .map((k) => {
      const m = k.match(/^['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s*(?::|$)/);
      return m ? m[1]! : '';
    })
    .filter(Boolean);
}

interface Blad {
  klucz: string;
  opis: string;
}

function bledyZapisow(): Blad[] {
  const out: Blad[] = [];
  for (const l of lancuchyZapytan()) {
    const kolumny = SCHEMAT.tabele.get(l.tabela);
    if (!kolumny || SCHEMAT.widoki.has(l.tabela)) continue;

    for (const m of l.tekst.matchAll(/\.(insert|update|upsert)\(\s*(\[\s*)?/g)) {
      const start = m.index! + m[0].length;
      const klucze = kluczeObiektu(l.tekst, start);
      if (!klucze) continue;
      for (const k of klucze) {
        if (kolumny.has(k.toLowerCase())) continue;
        out.push({
          klucz: `${l.plik} ${l.tabela}.${k}`,
          opis: `${l.plik}:${l.linia} ${m[1]} → ${l.tabela}.${k} (brak kolumny)`,
        });
      }
    }
  }
  return out;
}

const ZNANE: Record<string, string> = {};

describe('zapisy trafiają w istniejące kolumny', () => {
  it('ODKRYWANIE', () => {
    const nowe = bledyZapisow().filter((b) => !(b.klucz in ZNANE));
    if (process.env.ODKRYJ) for (const b of nowe) console.log(`ZAPIS  ${b.opis}`);
    expect(nowe.map((b) => b.opis)).toEqual([]);
  });
});
