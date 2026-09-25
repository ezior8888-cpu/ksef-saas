import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Każda kolumna w `.select('…')` istnieje w bazie — według MIGRACJI.
 *
 * PO CO TO JEST. Klient admina jest nieotypowany, a `types/database.ts` kończy
 * się na migracji 00044, więc ani TypeScript, ani atrapa bazy w testach nie
 * wiedzą, jakie kolumny naprawdę istnieją. Zapytanie o nieistniejącą kolumnę
 * kompiluje się, przechodzi testy i dopiero na produkcji PostgREST odrzuca je
 * błędem 42703 — a kod, który połyka błąd, pokazuje „zero" albo nic.
 *
 * Tak było 25.09 z dwoma miejscami: sekwencja maili próbnych pytała o
 * `users.tenant_id` (usunięte w 00036), a panel wsparcia o
 * `organization_join_requests.requester_user_id` (kolumna nazywa się
 * `requested_by_user_id`).
 *
 * Ten test buduje schemat Z MIGRACJI — jedynego źródła, któremu Postgres
 * wierzy — więc sprawdza też tabele, których w typach nie ma (Stripe, MFA,
 * GDPR, FLO).
 *
 * CZEGO NIE SPRAWDZA: widoków, relacji osadzonych (`tabela(kol)`), agregatów,
 * zapytań budowanych w locie i kolumn w `.eq()` / `.update()`. To celowo wąski,
 * pewny strażnik — lepiej nie zgłosić czegoś wątpliwego niż krzyczeć na
 * poprawny kod.
 */

const ROOT = process.cwd();

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function walk(dir: string, out: string[] = []): string[] {
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
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

function bezKomentarzySql(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function bezKomentarzyTs(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const NAZWA = '"?([a-z_][a-z0-9_]*)"?';
const TABELA = `(?:public\\.)?${NAZWA}`;

// ═══════════════════════════════════════════════════════════════
// Schemat z migracji
// ═══════════════════════════════════════════════════════════════

interface Schemat {
  tabele: Map<string, Set<string>>;
  widoki: Set<string>;
}

/** Ciało `CREATE TABLE … ( … )` — z liczeniem nawiasów. */
function cialoTabeli(sql: string, od: number): string {
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

/** Podział po przecinkach na najwyższym poziomie (nie w nawiasach). */
function naPoziomie(tekst: string): string[] {
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

const NIE_KOLUMNY = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

function schematZMigracji(): Schemat {
  const katalog = join(ROOT, 'supabase/migrations');
  const pliki = readdirSync(katalog).filter((f) => f.endsWith('.sql')).sort();

  const tabele = new Map<string, Set<string>>();
  const widoki = new Set<string>();

  for (const plik of pliki) {
    const sql = bezKomentarzySql(readFileSync(join(katalog, plik), 'utf8'));

    // Instrukcje po kolei, bo kolejność ma znaczenie (dodaj → usuń → dodaj).
    const instrukcje = sql.split(/;\s*(?:\n|$)/);
    let pozycja = 0;

    for (const instr of instrukcje) {
      const off = sql.indexOf(instr, pozycja);
      pozycja = off >= 0 ? off + instr.length : pozycja;

      const create = instr.match(
        new RegExp(`CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TABELA}\\s*\\(`, 'i'),
      );
      if (create) {
        const nazwa = create[1]!.toLowerCase();
        const cialo = cialoTabeli(instr, create.index! + create[0].length - 1);
        const kolumny = new Set<string>();
        for (const def of naPoziomie(cialo)) {
          const t = def.trim();
          if (!t || NIE_KOLUMNY.test(t)) continue;
          const m = t.match(/^"?([a-z_][a-z0-9_]*)"?\s/i);
          if (m) kolumny.add(m[1]!.toLowerCase());
        }
        tabele.set(nazwa, kolumny);
        continue;
      }

      const view = instr.match(
        new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TABELA}`, 'i'),
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
      if (alter) {
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
          new RegExp(`ADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${NAZWA}\\s`, 'gi'),
        )) {
          const k = m[1]!.toLowerCase();
          if (!['constraint', 'primary', 'unique', 'check', 'foreign'].includes(k)) kolumny.add(k);
        }
        for (const m of reszta.matchAll(
          new RegExp(`DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?${NAZWA}`, 'gi'),
        )) {
          const k = m[1]!.toLowerCase();
          if (!['constraint', 'default', 'not', 'column'].includes(k)) kolumny.delete(k);
        }
        for (const m of reszta.matchAll(
          new RegExp(`RENAME\\s+(?:COLUMN\\s+)?${NAZWA}\\s+TO\\s+${NAZWA}`, 'gi'),
        )) {
          if (m[1]!.toLowerCase() === 'to') continue;
          kolumny.delete(m[1]!.toLowerCase());
          kolumny.add(m[2]!.toLowerCase());
        }
      }
    }
  }

  return { tabele, widoki };
}

// ═══════════════════════════════════════════════════════════════
// Zapytania w kodzie
// ═══════════════════════════════════════════════════════════════

interface Uzycie {
  gdzie: string;
  tabela: string;
  kolumna: string;
}

/** Kolumny z listy `select` — tylko te, co do których nie ma wątpliwości. */
function kolumnySelecta(lista: string): string[] {
  const out: string[] = [];
  for (const surowy of naPoziomie(lista)) {
    let el = surowy.trim();
    if (!el || el === '*' || el.includes('(')) continue; // osadzone, agregaty
    if (el.includes(':') && !el.includes('::')) el = el.split(':').pop()!.trim(); // alias
    el = el.split('::')[0]!.split('->')[0]!.trim(); // rzutowanie, JSON
    if (/^[a-z_][a-z0-9_]*$/.test(el)) out.push(el);
  }
  return out;
}

function uzyciaWKodzie(): Uzycie[] {
  const out: Uzycie[] = [];

  for (const dir of ['lib', 'app']) {
    for (const f of walk(join(ROOT, dir))) {
      const kod = bezKomentarzyTs(readFileSync(f, 'utf8'));
      const plik = toPosix(f).replace(toPosix(ROOT) + '/', '');

      for (const m of kod.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
        const tabela = m[1]!;
        const reszta = kod.slice(m.index! + m[0].length);
        const koniec = Math.min(
          ...[reszta.indexOf(';'), reszta.indexOf('.from(')].filter((i) => i >= 0),
          reszta.length,
        );
        const lancuch = reszta.slice(0, koniec);

        // Pierwszy `.select('…')` w łańcuchu — tylko literał w apostrofach.
        const sel = lancuch.match(/\.select\(\s*'([^']*)'/);
        if (!sel) continue;

        const linia = kod.slice(0, m.index!).split('\n').length;
        for (const kolumna of kolumnySelecta(sel[1]!)) {
          out.push({ gdzie: `${plik}:${linia}`, tabela, kolumna });
        }
      }
    }
  }

  return out;
}

const SCHEMAT = schematZMigracji();

/**
 * ZNANE BŁĘDY — lista długu, nie lista wyjątków. Klucz: plik + tabela.kolumna
 * (bez numeru linii, bo ten się przesuwa). Każdy wpis czeka na DECYZJĘ, nie
 * na literówkę — dlatego nie jest poprawiony od ręki. Nowy błąd spoza listy
 * wywala test; wpis naprawiony musi z niej zniknąć.
 */
const ZNANE: Record<string, string> = {
  // (Eksport RODO pytał o nieistniejące kolumny faktur — naprawione w wydaniu
  // 25.09: faktury nie wchodzą do osobistego eksportu, a błąd już nie
  // udaje zera. Test pilnuje, żeby to nie wróciło.)

  // X-03: ksef_health_log to dziennik GLOBALNY (env, level, recorded_at),
  // bez tenant_id, status i checked_at. Stan karty „nie mogę zalogować się
  // Twoim certyfikatem” nie ma w bazie żadnego źródła per konto.
  'lib/inngest/jobs/cert-expiry-alert.ts ksef_health_log.status': 'X-03: brak per-konto śladu logowania',
  'lib/inngest/jobs/cert-expiry-alert.ts ksef_health_log.checked_at': 'X-03: brak per-konto śladu logowania',

  // K-03 jest zablokowane prawnie (flags.ts), więc i tak nie działa. Przed
  // odblokowaniem: invoices.source → origin (ta sama pomyłka co w X-05).
  'lib/flo/functions/payment-score.ts invoices.source': 'K-03 zablokowane: poprawić przed odblokowaniem',
};

function kluczBledu(u: Uzycie): string {
  return `${u.gdzie.split(':')[0]} ${u.tabela}.${u.kolumna}`;
}

describe('schemat z migracji — czy parser w ogóle działa', () => {
  it('zna tabele sprzed i po migracji 00044', () => {
    expect(SCHEMAT.tabele.get('invoices')?.has('tenant_id')).toBe(true);
    expect(SCHEMAT.tabele.get('flo_proposals')?.has('topic_key')).toBe(true);
    expect(SCHEMAT.tabele.get('ksef_offline_queue')?.has('deadline')).toBe(true);
    expect(SCHEMAT.tabele.size).toBeGreaterThanOrEqual(55);
  });

  it('pamięta o kolumnach usuniętych i dodanych później', () => {
    // 00036: DROP COLUMN users.tenant_id, ADD COLUMN last_active_tenant_id.
    expect(SCHEMAT.tabele.get('users')?.has('tenant_id')).toBe(false);
    expect(SCHEMAT.tabele.get('users')?.has('last_active_tenant_id')).toBe(true);
    // 00047: ADD COLUMN tenants.stripe_customer_id.
    expect(SCHEMAT.tabele.get('tenants')?.has('stripe_customer_id')).toBe(true);
  });

  it('zna prawdziwą nazwę kolumny próśb o dołączenie', () => {
    const kolumny = SCHEMAT.tabele.get('organization_join_requests');
    expect(kolumny?.has('requested_by_user_id')).toBe(true);
    expect(kolumny?.has('requester_user_id')).toBe(false);
  });
});

describe('każda kolumna w select istnieje w bazie', () => {
  it('skan widzi zapytania w kodzie', () => {
    expect(uzyciaWKodzie().length).toBeGreaterThan(200);
  });

  function wszystkieBledy(): Uzycie[] {
    return uzyciaWKodzie()
      .filter((u) => SCHEMAT.tabele.has(u.tabela) && !SCHEMAT.widoki.has(u.tabela))
      .filter((u) => !SCHEMAT.tabele.get(u.tabela)!.has(u.kolumna));
  }

  it('lista znanych błędów nie trzyma wpisów już naprawionych', () => {
    const teraz = new Set(wszystkieBledy().map(kluczBledu));
    const nieaktualne = Object.keys(ZNANE).filter((k) => !teraz.has(k));

    expect(nieaktualne, 'Te błędy są już naprawione — usuń je z ZNANE.').toEqual([]);
  });

  it('żaden select nie pyta o kolumnę, której migracje nie tworzą', () => {
    const bledy = wszystkieBledy()
      .filter((u) => !(kluczBledu(u) in ZNANE))
      .map((u) => `${u.gdzie}  ${u.tabela}.${u.kolumna}`);

    expect(
      bledy,
      'PostgREST odrzuci takie zapytanie błędem 42703, a TypeScript tego nie widzi ' +
        '(klient admina jest nieotypowany). Sprawdź nazwę kolumny w supabase/migrations.',
    ).toEqual([]);
  });
});
