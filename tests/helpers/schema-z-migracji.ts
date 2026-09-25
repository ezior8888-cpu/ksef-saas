import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Schemat bazy odczytany Z MIGRACJI — jedynego źródła, któremu wierzy Postgres.
 *
 * PO CO. Klient admina jest nieotypowany, a `types/database.ts` kończy się na
 * migracji 00044, więc ani TypeScript, ani atrapa bazy nie wiedzą, jakie
 * kolumny i wartości naprawdę istnieją. Zapytanie o nieistniejącą kolumnę albo
 * wartość spoza enuma kompiluje się, przechodzi testy i pada dopiero na
 * produkcji — a kod, który połyka `error`, pokazuje „zero".
 *
 * Czyta: CREATE TABLE, ALTER TABLE (ADD / DROP / RENAME / ALTER COLUMN TYPE,
 * ADD CONSTRAINT … CHECK), DROP TABLE, CREATE VIEW, CREATE TYPE … AS ENUM,
 * ALTER TYPE … ADD VALUE oraz ograniczenia `CHECK (kolumna IN (…))`.
 *
 * Świadomie NIE czyta innych form CHECK (np. `= ANY(ARRAY[…])`), funkcji ani
 * polityk — tam, gdzie nie jest pewien, nie zgłasza niczego.
 */

export interface Schemat {
  /** tabela → kolumny */
  tabele: Map<string, Set<string>>;
  widoki: Set<string>;
  /** "tabela.kolumna" → dozwolone wartości (enum albo CHECK IN) */
  wartosci: Map<string, Set<string>>;
}

const NAZWA = '"?([a-z_][a-z0-9_]*)"?';
const TABELA = `(?:public\\.)?${NAZWA}`;
const NIE_KOLUMNY = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

export function toPosix(p: string): string {
  return p.split(sep).join('/');
}

export function bezKomentarzyTs(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bezKomentarzySql(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Podział po przecinkach na najwyższym poziomie (nie w nawiasach). */
export function naPoziomie(tekst: string): string[] {
  const out: string[] = [];
  let glebokosc = 0;
  let biezacy = '';
  for (const znak of tekst) {
    if (znak === '(') glebokosc++;
    if (znak === ')') glebokosc--;
    if (znak === ',' && glebokosc === 0) {
      out.push(biezacy);
      biezacy = '';
    } else {
      biezacy += znak;
    }
  }
  if (biezacy.trim()) out.push(biezacy);
  return out;
}

function cialoWNawiasach(sql: string, od: number): string {
  const start = sql.indexOf('(', od);
  let glebokosc = 0;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === '(') glebokosc++;
    else if (sql[i] === ')') {
      glebokosc--;
      if (glebokosc === 0) return sql.slice(start + 1, i);
    }
  }
  return '';
}

function literaly(tekst: string): string[] {
  return [...tekst.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

function bezSchematu(typ: string): string {
  return typ.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
}

export function schematZMigracji(root: string = process.cwd()): Schemat {
  const katalog = join(root, 'supabase/migrations');
  const pliki = readdirSync(katalog).filter((f) => f.endsWith('.sql')).sort();

  const tabele = new Map<string, Set<string>>();
  const widoki = new Set<string>();
  const wartosci = new Map<string, Set<string>>();
  const enumy = new Map<string, Set<string>>();

  /** Kolumna o typie będącym enumem dziedziczy jego wartości (ten sam obiekt). */
  function typKolumny(tabela: string, kolumna: string, typ: string) {
    const e = enumy.get(bezSchematu(typ));
    if (e) wartosci.set(`${tabela}.${kolumna}`, e);
  }

  /** CHECK (kolumna IN ('a', 'b')) w dowolnym miejscu fragmentu. */
  function checkiIn(tabela: string, fragment: string) {
    for (const m of fragment.matchAll(
      new RegExp(`CHECK\\s*\\(\\s*\\(?\\s*${NAZWA}\\s+IN\\s*\\(([^)]*)\\)`, 'gi'),
    )) {
      // Tylko CHECK na napisach. Liczbowy (np. etapy kanarka 0/10/50/100)
      // pomijamy — pusty zbiór uznawałby każdą wartość za błędną.
      const w = literaly(m[2]!);
      if (w.length > 0) wartosci.set(`${tabela}.${m[1]!.toLowerCase()}`, new Set(w));
    }
  }

  for (const plik of pliki) {
    const sql = bezKomentarzySql(readFileSync(join(katalog, plik), 'utf8'));

    for (const instr of sql.split(/;\s*(?:\n|$)/)) {
      const typ = instr.match(new RegExp(`CREATE\\s+TYPE\\s+${TABELA}\\s+AS\\s+ENUM\\s*\\(`, 'i'));
      if (typ) {
        const cialo = cialoWNawiasach(instr, typ.index! + typ[0].length - 1);
        enumy.set(typ[1]!.toLowerCase(), new Set(literaly(cialo)));
        continue;
      }

      const dodajWartosc = instr.match(
        new RegExp(`ALTER\\s+TYPE\\s+${TABELA}\\s+ADD\\s+VALUE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'([^']*)'`, 'i'),
      );
      if (dodajWartosc) {
        enumy.get(dodajWartosc[1]!.toLowerCase())?.add(dodajWartosc[2]!);
        continue;
      }

      const create = instr.match(
        new RegExp(`CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TABELA}\\s*\\(`, 'i'),
      );
      if (create) {
        const nazwa = create[1]!.toLowerCase();
        const cialo = cialoWNawiasach(instr, create.index! + create[0].length - 1);
        const kolumny = new Set<string>();
        for (const def of naPoziomie(cialo)) {
          const t = def.trim();
          if (!t) continue;
          if (NIE_KOLUMNY.test(t)) {
            checkiIn(nazwa, t);
            continue;
          }
          const m = t.match(/^"?([a-z_][a-z0-9_]*)"?\s+("?[a-z_][a-z0-9_.]*"?)/i);
          if (!m) continue;
          const kolumna = m[1]!.toLowerCase();
          kolumny.add(kolumna);
          typKolumny(nazwa, kolumna, m[2]!);
          checkiIn(nazwa, t);
        }
        tabele.set(nazwa, kolumny);
        continue;
      }

      const view = instr.match(
        new RegExp(
          `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TABELA}`,
          'i',
        ),
      );
      if (view) {
        widoki.add(view[1]!.toLowerCase());
        continue;
      }

      const drop = instr.match(new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${TABELA}`, 'i'));
      if (drop) {
        tabele.delete(drop[1]!.toLowerCase());
        continue;
      }

      const alter = instr.match(
        new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${TABELA}([\\s\\S]*)$`, 'i'),
      );
      if (!alter) continue;

      const nazwa = alter[1]!.toLowerCase();
      const reszta = alter[2]!;
      const kolumny = tabele.get(nazwa);
      if (!kolumny) continue;

      const zmianaNazwy = reszta.match(new RegExp(`^\\s*RENAME\\s+TO\\s+${NAZWA}`, 'i'));
      if (zmianaNazwy) {
        tabele.delete(nazwa);
        tabele.set(zmianaNazwy[1]!.toLowerCase(), kolumny);
        continue;
      }

      for (const m of reszta.matchAll(
        new RegExp(`ADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${NAZWA}\\s+("?[a-z_][a-z0-9_.]*"?)`, 'gi'),
      )) {
        const k = m[1]!.toLowerCase();
        if (['constraint', 'primary', 'unique', 'check', 'foreign'].includes(k)) continue;
        kolumny.add(k);
        typKolumny(nazwa, k, m[2]!);
      }
      for (const m of reszta.matchAll(
        new RegExp(`DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?${NAZWA}`, 'gi'),
      )) {
        const k = m[1]!.toLowerCase();
        if (['constraint', 'default', 'not', 'column'].includes(k)) continue;
        kolumny.delete(k);
        wartosci.delete(`${nazwa}.${k}`);
      }
      for (const m of reszta.matchAll(
        new RegExp(`RENAME\\s+(?:COLUMN\\s+)?${NAZWA}\\s+TO\\s+${NAZWA}`, 'gi'),
      )) {
        if (m[1]!.toLowerCase() === 'to') continue;
        const [stara, nowa] = [m[1]!.toLowerCase(), m[2]!.toLowerCase()];
        kolumny.delete(stara);
        kolumny.add(nowa);
        const w = wartosci.get(`${nazwa}.${stara}`);
        if (w) {
          wartosci.delete(`${nazwa}.${stara}`);
          wartosci.set(`${nazwa}.${nowa}`, w);
        }
      }
      for (const m of reszta.matchAll(
        new RegExp(`ALTER\\s+(?:COLUMN\\s+)?${NAZWA}\\s+(?:SET\\s+DATA\\s+)?TYPE\\s+("?[a-z_][a-z0-9_.]*"?)`, 'gi'),
      )) {
        typKolumny(nazwa, m[1]!.toLowerCase(), m[2]!);
      }
      checkiIn(nazwa, reszta);
    }
  }

  return { tabele, widoki, wartosci };
}

/** Pliki .ts/.tsx pod katalogiem (bez node_modules i .next). */
export function plikiKodu(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      plikiKodu(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

export interface Lancuch {
  plik: string;
  linia: number;
  tabela: string;
  /** Tekst łańcucha po `.from('tabela')` do średnika albo następnego `.from(`. */
  tekst: string;
}

/** Wszystkie łańcuchy zapytań `.from('…')` w kodzie produkcyjnym. */
export function lancuchyZapytan(root: string = process.cwd()): Lancuch[] {
  const out: Lancuch[] = [];
  for (const dir of ['lib', 'app']) {
    for (const f of plikiKodu(join(root, dir))) {
      const kod = bezKomentarzyTs(readFileSync(f, 'utf8'));
      const plik = toPosix(f).replace(toPosix(root) + '/', '');
      for (const m of kod.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
        const reszta = kod.slice(m.index! + m[0].length);
        const koniec = Math.min(
          ...[reszta.indexOf(';'), reszta.indexOf('.from(')].filter((i) => i >= 0),
          reszta.length,
        );
        out.push({
          plik,
          linia: kod.slice(0, m.index!).split('\n').length,
          tabela: m[1]!,
          tekst: reszta.slice(0, koniec),
        });
      }
    }
  }
  return out;
}
