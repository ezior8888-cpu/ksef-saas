import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bezKomentarzyTs,
  lancuchyZapytan,
  plikiKodu,
  schematZMigracji,
  toPosix,
} from '../helpers/schema-z-migracji';

/**
 * Kierunek faktury w bazie to `'outgoing'` / `'incoming'` — nie `'issued'`.
 *
 * `invoices.direction` ma od migracji 00001 `CHECK (direction IN ('outgoing',
 * 'incoming'))`, a wszystko, co zapisuje faktury (import, skrzynka KSeF,
 * samofakturowanie), używa tych wartości. `'issued'` / `'received'` to nazwy
 * z API KSeF i z tabeli `import_jobs`.
 *
 * Do 25.09.2026 dwanaście miejsc w kodzie pytało o `'issued'`. Kolumna jest
 * tekstowa, więc Postgres nie zgłaszał błędu — filtr po prostu nie pasował
 * do niczego, nigdy:
 *
 * - przygotowanie ponaglenia (nowe w wydaniu 25.09) odrzucało KAŻDĄ fakturę,
 * - reguły agenta K-01, P-03, O-01 i X-05 nie widziały żadnej faktury,
 * - metryki platformy i biznesowe oraz FLO Wrapped liczyły zero.
 *
 * Testy były zielone, bo ich dane też miały `'issued'`.
 */

const SCHEMAT = schematZMigracji();
const DOZWOLONE = SCHEMAT.wartosci.get('invoices.direction') ?? new Set<string>();

/**
 * Znany dług. Klucz: miejsce + wartość. Widok w bazie naprawia się migracją,
 * a migracje są działką właściciela repo — stąd lista, nie poprawka.
 */
// Widok invoices_overdue naprawiony migracją 00082 — lista pusta.
const ZNANE: Record<string, string> = {};

/** Ostatnia definicja widoku w migracjach (późniejsze zastępują wcześniejsze). */
function aktualnyWidok(nazwa: string): string | null {
  const katalog = join(process.cwd(), 'supabase/migrations');
  let ostatni: string | null = null;
  for (const plik of readdirSync(katalog).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(katalog, plik), 'utf8').replace(/--[^\n]*/g, '');
    const re = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(?:public\\.)?${nazwa}\\b[\\s\\S]*?;`,
      'gi',
    );
    for (const m of sql.matchAll(re)) ostatni = m[0];
  }
  return ostatni;
}

function bledy(): { klucz: string; opis: string }[] {
  const out: { klucz: string; opis: string }[] = [];
  const zla = (w: string) => !DOZWOLONE.has(w);

  // 1. Filtry w zapytaniach o tabelę faktur.
  for (const l of lancuchyZapytan().filter((l) => l.tabela === 'invoices')) {
    for (const m of l.tekst.matchAll(/\.(?:eq|neq)\(\s*'direction'\s*,\s*'([^']*)'/g)) {
      if (zla(m[1]!)) {
        out.push({ klucz: `${l.plik} direction='${m[1]}'`, opis: `${l.plik}:${l.linia} filtr direction='${m[1]}'` });
      }
    }
    for (const m of l.tekst.matchAll(/\.in\(\s*'direction'\s*,\s*\[([^\]]*)\]/g)) {
      for (const w of m[1]!.matchAll(/'([^']*)'/g)) {
        if (zla(w[1]!)) {
          out.push({ klucz: `${l.plik} direction='${w[1]}'`, opis: `${l.plik}:${l.linia} filtr direction IN '${w[1]}'` });
        }
      }
    }
  }

  // 2. Porównania na wierszu faktury w kodzie (np. `invoice.direction !== …`).
  for (const dir of ['lib', 'app']) {
    for (const f of plikiKodu(join(process.cwd(), dir))) {
      const kod = bezKomentarzyTs(readFileSync(f, 'utf8'));
      const plik = toPosix(f).replace(toPosix(process.cwd()) + '/', '');
      // Eksporty (JPK, KPiR) mają WŁASNY słownik 'issued' / 'received' i sami
      // nadają te etykiety. Do bazy trafiają przez data-fetcher.ts, który
      // mapuje je na 'outgoing' / 'incoming' — a ten filtr sprawdza punkt 1.
      if (plik.startsWith('lib/exports/')) continue;
      for (const m of kod.matchAll(/\b(?:invoice|inv|faktura)\.direction\s*[!=]==?\s*'([^']*)'/g)) {
        if (zla(m[1]!)) {
          out.push({ klucz: `${plik} direction='${m[1]}'`, opis: `${plik} porównanie direction === '${m[1]}'` });
        }
      }
    }
  }

  // 3. Widoki w bazie.
  const widok = aktualnyWidok('invoices_overdue');
  for (const m of (widok ?? '').matchAll(/direction\s*=\s*'([^']*)'/g)) {
    if (zla(m[1]!)) {
      out.push({ klucz: `widok invoices_overdue direction='${m[1]}'`, opis: `widok invoices_overdue: direction = '${m[1]}'` });
    }
  }

  return out;
}

describe('kierunek faktury zgodny z bazą', () => {
  it('baza zna dokładnie dwa kierunki', () => {
    expect([...DOZWOLONE].sort()).toEqual(['incoming', 'outgoing']);
  });

  it('żaden filtr ani porównanie nie używa kierunku, którego baza nie zna', () => {
    const nowe = bledy().filter((b) => !(b.klucz in ZNANE));

    expect(
      nowe.map((b) => b.opis),
      'Wystawiona faktura to w bazie direction = \'outgoing\', otrzymana — \'incoming\'. ' +
        '\'issued\'/\'received\' to nazwy z API KSeF; filtr po nich nie pasuje do niczego.',
    ).toEqual([]);
  });

  it('lista długu nie trzyma wpisów już naprawionych', () => {
    const teraz = new Set(bledy().map((b) => b.klucz));
    expect(Object.keys(ZNANE).filter((k) => !teraz.has(k))).toEqual([]);
  });

  it('skan widzi zapytania o faktury i widok zaległości', () => {
    expect(lancuchyZapytan().filter((l) => l.tabela === 'invoices').length).toBeGreaterThan(30);
    expect(aktualnyWidok('invoices_overdue')).not.toBeNull();
  });
});
