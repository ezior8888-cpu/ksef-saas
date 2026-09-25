import { describe, expect, it } from 'vitest';

import {
  lancuchyZapytan,
  schematZMigracji,
  type Lancuch,
} from '../helpers/schema-z-migracji';

/**
 * Filtry zapytań pytają o kolumny i wartości, które ISTNIEJĄ w bazie.
 *
 * `db-select-columns.test.ts` pilnuje list `select`. Ten plik pilnuje filtrów
 * — i tam siedziały najgorsze błędy z przeglądu 24–25.09:
 *
 * - `.eq('status', 'pending')` na kolejce Offline24, której enum nie ma
 *   `pending` — karta awarii KSeF, licznik w panelu i alarm dla operatorów
 *   nie działały nigdy (#38),
 * - `.eq('tenant_id', …)` i `.order('checked_at')` na globalnym
 *   `ksef_health_log`, który tych kolumn nie ma (X-03).
 *
 * Wartości dozwolone czytane są z enumów (`CREATE TYPE … AS ENUM` +
 * `ALTER TYPE … ADD VALUE`) i z ograniczeń `CHECK (kolumna IN (…))` —
 * z migracji, nie z typów, bo typy są nieaktualne od 00044.
 */

const SCHEMAT = schematZMigracji();
const LANCUCHY = lancuchyZapytan().filter(
  (l) => SCHEMAT.tabele.has(l.tabela) && !SCHEMAT.widoki.has(l.tabela),
);

const FILTRY = 'eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|overlaps|order';

interface Blad {
  klucz: string;
  gdzie: string;
  opis: string;
}

function kolumnaFiltra(surowa: string): string | null {
  // Relacja osadzona (`tenants.nip`) — to inna tabela, nie oceniamy.
  if (surowa.includes('.')) return null;
  const k = surowa.split('->')[0]!.trim();
  return /^[a-z_][a-z0-9_]*$/.test(k) ? k : null;
}

function bledyKolumn(l: Lancuch): Blad[] {
  const kolumny = SCHEMAT.tabele.get(l.tabela)!;
  const out: Blad[] = [];
  for (const m of l.tekst.matchAll(new RegExp(`\\.(?:${FILTRY})\\(\\s*'([^']+)'`, 'g'))) {
    const k = kolumnaFiltra(m[1]!);
    if (!k || kolumny.has(k)) continue;
    out.push({
      klucz: `${l.plik} ${l.tabela}.${k}`,
      gdzie: `${l.plik}:${l.linia}`,
      opis: `filtr po kolumnie ${l.tabela}.${k}, której migracje nie tworzą`,
    });
  }
  return out;
}

function bledyWartosci(l: Lancuch): Blad[] {
  const out: Blad[] = [];

  const sprawdz = (kolumna: string, wartosc: string) => {
    const dozwolone = SCHEMAT.wartosci.get(`${l.tabela}.${kolumna}`);
    if (!dozwolone || dozwolone.has(wartosc)) return;
    out.push({
      klucz: `${l.plik} ${l.tabela}.${kolumna}='${wartosc}'`,
      gdzie: `${l.plik}:${l.linia}`,
      opis: `${l.tabela}.${kolumna} = '${wartosc}' — dozwolone: ${[...dozwolone].join(', ')}`,
    });
  };

  for (const m of l.tekst.matchAll(/\.(?:eq|neq)\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([^']*)'\s*\)/g)) {
    sprawdz(m[1]!, m[2]!);
  }
  for (const m of l.tekst.matchAll(/\.in\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*\[([^\]]*)\]/g)) {
    const kolumna = m[1]!;
    const lista = [...m[2]!.matchAll(/'([^']*)'/g)].map((w) => w[1]!);
    const dozwolone = SCHEMAT.wartosci.get(`${l.tabela}.${kolumna}`);
    // Enum: każda zła wartość wywala zapytanie — zgłaszamy każdą.
    // Tekst z CHECK: zła wartość po prostu nie pasuje, więc lista psuje się
    // dopiero wtedy, gdy NIC z niej nie jest dozwolone.
    const enumowa = SCHEMAT.enumowe.has(`${l.tabela}.${kolumna}`);
    if (!enumowa && dozwolone && lista.some((w) => dozwolone.has(w))) continue;
    for (const w of lista) sprawdz(kolumna, w);
  }
  return out;
}

/**
 * Znany dług — ten sam wzorzec co w strażnikach podpięcia i select: lista
 * nie może rosnąć po cichu ani trzymać wpisów już naprawionych.
 */
const ZNANE: Record<string, string> = {
  // Kolejka Offline24 pytana o 'pending' (enum: queued/sending/…) — naprawione
  // w PR #38 (baza: main). Wpisy znikną, gdy #38 trafi do tej gałęzi.
  "lib/admin/system.ts ksef_offline_queue.status='pending'": 'naprawione w #38',
  "lib/inngest/jobs/critical-alerts-monitor.ts ksef_offline_queue.status='pending'": 'naprawione w #38',
  "lib/inngest/jobs/process-offline-queue.ts ksef_offline_queue.status='pending'": 'naprawione w #38',

  // X-03: ksef_health_log jest globalny — nie ma tenant_id ani checked_at.
  // Stan „nie mogę zalogować się Twoim certyfikatem” nie ma źródła per konto.
  'lib/inngest/jobs/cert-expiry-alert.ts ksef_health_log.tenant_id': 'X-03: brak per-konto śladu logowania',
  'lib/inngest/jobs/cert-expiry-alert.ts ksef_health_log.checked_at': 'X-03: brak per-konto śladu logowania',

  // K-03 zablokowane prawnie; przed odblokowaniem: source → origin.
  'lib/flo/functions/payment-score.ts invoices.source': 'K-03 zablokowane: poprawić przed odblokowaniem',
};

describe('schemat z migracji — wartości', () => {
  it('zna enumy i ograniczenia CHECK', () => {
    expect([...(SCHEMAT.wartosci.get('ksef_offline_queue.status') ?? [])]).toEqual([
      'queued',
      'sending',
      'sent',
      'failed',
      'expired',
    ]);
    expect(SCHEMAT.wartosci.get('flo_proposals.status')?.has('dismissed')).toBe(true);
    expect(SCHEMAT.wartosci.get('flo_rollout.stage')).toBeUndefined(); // CHECK liczbowy
    expect(SCHEMAT.wartosci.size).toBeGreaterThan(20);
  });

  it('skan widzi filtry w kodzie', () => {
    expect(LANCUCHY.length).toBeGreaterThan(200);
  });
});

describe('filtry pytają o to, co istnieje', () => {
  const wszystko = () => LANCUCHY.flatMap((l) => [...bledyKolumn(l), ...bledyWartosci(l)]);

  it('żaden filtr nie pyta o kolumnę albo wartość, której baza nie zna', () => {
    const nowe = wszystko().filter((b) => !(b.klucz in ZNANE));
    if (process.env.ODKRYJ) for (const x of nowe) console.log(`ZNALEZISKO  ${x.gdzie}  ${x.opis}`);

    expect(
      nowe.map((b) => `${b.gdzie}  ${b.opis}`),
      'Filtr po nieistniejącej kolumnie albo wartości spoza enuma/CHECK nie pasuje ' +
        'do niczego (albo wywala zapytanie przy enumie). Sprawdź supabase/migrations.',
    ).toEqual([]);
  });

  it('lista znanego długu nie trzyma wpisów już naprawionych', () => {
    const teraz = new Set(wszystko().map((b) => b.klucz));
    expect(
      Object.keys(ZNANE).filter((k) => !teraz.has(k)),
      'Te wpisy są już naprawione — usuń je z ZNANE.',
    ).toEqual([]);
  });
});
