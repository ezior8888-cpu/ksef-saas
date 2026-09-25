import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { OFFLINE_QUEUE_OPEN_STATUSES } from '@/lib/ksef/offline-queue-status';

/**
 * Każde zapytanie o kolejkę Offline24 pyta o status, który ISTNIEJE.
 *
 * Do 25.09.2026 cztery miejsca pytały o `'pending'` — status z enuma UPO,
 * nie z enuma kolejki. Postgres odrzucał zapytanie, a każde z tych miejsc
 * połykało błąd i pokazywało „zero": karta awarii KSeF nie powstała ani razu,
 * panel admina pokazywał 0 faktur w kolejce, alarm dla operatorów nie mógł
 * wystrzelić.
 *
 * Atrapa bazy w testach nie zna enumów, a klient admina jest nieotypowany,
 * więc ani testy, ani TypeScript tego nie widziały. Ten test czyta enum
 * WPROST Z MIGRACJI — jedynego miejsca, któremu Postgres wierzy — i porównuje
 * z nim każdy literał statusu w kodzie.
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

/** Komentarze wycięte — wzmianka o błędzie w komentarzu nie jest błędem. */
function bezKomentarzy(tresc: string): string {
  return tresc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Enum statusu kolejki tak, jak go widzi Postgres. */
function enumZMigracji(): string[] {
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/00015_ksef_compliance.sql'),
    'utf8',
  );
  const m = sql.match(
    /CREATE TYPE public\.offline_queue_status_enum AS ENUM \(([^)]*)\)/,
  );
  if (!m) throw new Error('nie znalazłem offline_queue_status_enum w migracji 00015');
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

/** Wszystkie literały statusu użyte w zapytaniach o `ksef_offline_queue`. */
function literalyWKodzie(): { plik: string; status: string }[] {
  const wyniki: { plik: string; status: string }[] = [];

  for (const dir of ['lib', 'app']) {
    for (const f of walk(join(ROOT, dir))) {
      const kod = bezKomentarzy(readFileSync(f, 'utf8'));
      const plik = toPosix(f).replace(toPosix(ROOT) + '/', '');

      let od = kod.indexOf("from('ksef_offline_queue')");
      while (od >= 0) {
        // Łańcuch zapytania kończy się na średniku albo na następnym `.from(`
        // (np. kilka zapytań w jednym Promise.all).
        const reszta = kod.slice(od + 1);
        const koniec = Math.min(
          ...[reszta.indexOf(';'), reszta.indexOf('.from(')].filter((i) => i >= 0),
          reszta.length,
        );
        const lancuch = reszta.slice(0, koniec);

        for (const m of lancuch.matchAll(/\.(?:eq|neq)\(\s*'status'\s*,\s*'([^']+)'/g)) {
          wyniki.push({ plik, status: m[1]! });
        }
        for (const m of lancuch.matchAll(/\.in\(\s*'status'\s*,\s*\[([^\]]*)\]/g)) {
          for (const s of m[1]!.matchAll(/'([^']+)'/g)) {
            wyniki.push({ plik, status: s[1]! });
          }
        }

        od = kod.indexOf("from('ksef_offline_queue')", od + 1);
      }
    }
  }

  return wyniki;
}

const ENUM = enumZMigracji();

describe('kolejka Offline24 — statusy zgodne z bazą', () => {
  it('enum z migracji jest odczytany', () => {
    // Gdyby ktoś przeformatował migrację, test ma paść głośno, a nie
    // porównywać z pustą listą.
    expect(ENUM).toEqual(['queued', 'sending', 'sent', 'failed', 'expired']);
  });

  it('żadne zapytanie o kolejkę nie pyta o status, którego enum nie ma', () => {
    const zle = literalyWKodzie().filter((u) => !ENUM.includes(u.status));

    expect(
      zle,
      'Postgres odrzuci takie zapytanie, a kod, który połyka błąd, pokaże „zero". ' +
        'Użyj OFFLINE_QUEUE_OPEN_STATUSES z lib/ksef/offline-queue-status.ts.',
    ).toEqual([]);
  });

  it('skan naprawdę widzi zapytania o kolejkę', () => {
    // Zabezpieczenie przed testem, który przechodzi, bo niczego nie znalazł.
    const pliki = new Set(literalyWKodzie().map((u) => u.plik));
    expect(pliki.size).toBeGreaterThan(0);
    expect([...pliki]).toContain('lib/inngest/jobs/process-offline-queue.ts');
  });

  it('„otwarte" wpisy to czekające i w trakcie wysyłki — oba istnieją w enumie', () => {
    expect([...OFFLINE_QUEUE_OPEN_STATUSES]).toEqual(['queued', 'sending']);
    for (const s of OFFLINE_QUEUE_OPEN_STATUSES) expect(ENUM).toContain(s);
  });

  it('typy w types/database.ts zgadzają się z migracją', () => {
    // Stała jest otypowana enumem z types/database.ts. Gdyby te typy
    // rozjechały się z bazą, kompilator pilnowałby nieprawdy.
    const typy = readFileSync(join(ROOT, 'types/database.ts'), 'utf8');
    const m = typy.match(/offline_queue_status_enum:\s*((?:\|\s*"[^"]+"\s*)+)/);
    const zTypow = m ? [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];

    expect(zTypow).toEqual(ENUM);
  });
});
