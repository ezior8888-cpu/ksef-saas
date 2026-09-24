import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kindStatus } from '@/lib/flo/flags';
import type { FloProposalKind } from '@/types/flo';

/**
 * Test architektoniczny: FUNKCJA ZBUDOWANA I NIEPODPIĘTA MA BYĆ WIDOCZNA.
 *
 * W tym projekcie cztery razy zdarzyło się to samo: moduł był napisany,
 * otestowany i opisany w planie jako gotowy, a w rzeczywistości nikt go nie
 * wołał. X-05 przez tygodnie nie tworzył ani jednej karty, wykonawca K-01
 * pisał do nieistniejących kolumn, ekran wyciszeń pokazywał atrapę, a tryb
 * cichy nie zapisał ani jednego wpisu od dnia powstania. Za każdym razem
 * testy jednostkowe były zielone, bo testowały funkcję, a nie to, czy ktoś
 * jej używa.
 *
 * Ten plik zamienia „ktoś zauważy" na „test nie przejdzie". Nie sprawdza,
 * czy kod działa — od tego są testy funkcji. Sprawdza, czy jest PODŁĄCZONY,
 * a jeżeli nie, to czy ktoś to świadomie zapisał.
 *
 * Wzorzec listy długu jest ten sam co w `flo-architecture.test.ts`: lista
 * nie może urosnąć po cichu ANI zostać z wpisem, który już nie jest długiem.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['lib', 'app', 'scripts'];

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

/**
 * Komentarze wycięte PRZED szukaniem nazw.
 *
 * Bez tego zdanie „docelowo zawoła tu `buildRateRaiseProposal`" w komentarzu
 * zupełnie innego pliku liczyłoby się jako podpięcie i uciszało strażnika —
 * czyli dokładnie w chwili, w której ktoś opisuje plany, test przestawałby
 * pilnować rzeczywistości.
 */
function bezKomentarzy(tresc: string): string {
  return tresc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Kod produkcyjny. Testy są POMINIĘTE i to jest cały sens tego pliku. */
const KOD = new Map<string, string>();
for (const dir of SCAN_DIRS) {
  for (const f of walk(join(ROOT, dir))) {
    KOD.set(
      toPosix(f).replace(toPosix(ROOT) + '/', ''),
      bezKomentarzy(readFileSync(f, 'utf8')),
    );
  }
}

const PLIKI_FLO = [...KOD.keys()].filter((p) => p.startsWith('lib/flo/'));

function eksportyZ(plik: string): string[] {
  return [...(KOD.get(plik) ?? '').matchAll(/^export (?:async )?function (\w+)/gm)].map(
    (m) => m[1]!,
  );
}

function wolaneGdzieIndziej(nazwa: string, wlasnyPlik: string): boolean {
  const wzorzec = new RegExp(`\\b${nazwa}\\b`);
  for (const [plik, tresc] of KOD) {
    if (plik === wlasnyPlik) continue;
    if (wzorzec.test(tresc)) return true;
  }
  return false;
}

/**
 * Moduł „żywy" to taki, z którego cokolwiek jest wołane z zewnątrz.
 *
 * Potrzebne, bo builder bywa pomocnikiem wołanym przez sąsiada w TYM SAMYM
 * pliku — tak działa W-03 (`buildRuleProposal` ← `proposeRuleAfterReview`)
 * i K-01 (`buildPaymentConfirmProposal` ← `buildInvoiceConfirmProposal`).
 * Bez tego rozróżnienia test krzyczałby na kod, który jest w pełni podpięty.
 */
const ZYWE_MODULY = new Set(
  PLIKI_FLO.filter((plik) =>
    eksportyZ(plik).some((nazwa) => wolaneGdzieIndziej(nazwa, plik)),
  ),
);

function jestPodpiety(nazwa: string, plik: string): boolean {
  if (wolaneGdzieIndziej(nazwa, plik)) return true;
  if (!ZYWE_MODULY.has(plik)) return false;

  // Wystąpienie drugie i dalsze = użycie, nie sama definicja.
  const ile = ((KOD.get(plik) ?? '').match(new RegExp(`\\b${nazwa}\\b`, 'g')) ?? [])
    .length;
  return ile >= 2;
}

/** Wszystkie buildery propozycji w agencie. */
const BUDOWNICZOWIE = PLIKI_FLO.flatMap((plik) =>
  eksportyZ(plik)
    .filter((nazwa) => /^build\w*Proposal/.test(nazwa))
    .map((nazwa) => ({ plik, nazwa })),
);

const NIEPODPIETE = BUDOWNICZOWIE.filter((b) => !jestPodpiety(b.nazwa, b.plik))
  .map((b) => b.nazwa)
  .sort();

/**
 * ZBUDOWANE, ALE JESZCZE NIEPODPIĘTE — lista długu, nie lista wyjątków.
 *
 * Wartość mówi, CZEGO brakuje. Dwie kategorie, bardzo różne:
 *
 * · „bramka prawna" — funkcja jest gotowa, ale rodzaj stoi w `flags.ts`
 *   i podpięcie jej byłoby błędem, nie postępem. Osobny test pilnuje, że
 *   te wpisy naprawdę odpowiadają blokadzie w kodzie.
 *
 * · „brak producenta" — nikt nie tworzy karty. To jest zwykły dług planu:
 *   dokładnie ta robota, którą zamykały zadania K1.8–K1.11 dla W-03, W-04,
 *   P-03 i O-01.
 */
const ZNANY_DLUG: Record<string, string> = {
  // ── bramka prawna: podpinać NIE WOLNO ───────────────────────
  buildForeignProposal: 'bramka prawna — contractor.foreign zablokowane w flags.ts',
  buildPaymentScoreProposal: 'bramka prawna — payment.score zablokowane w flags.ts',
  buildReliefProposal: 'bramka prawna — tax.relief zablokowane w flags.ts',
  buildSetAsideProposal: 'bramka prawna — tax.setaside zablokowane w flags.ts',
  buildVatLimitProposal: 'bramka prawna — tax.limit zablokowane w flags.ts',

  // ── brak producenta: zwykły dług planu ──────────────────────
  buildContractorCheckProposal: 'brak producenta — contractor.check',
  buildHintProposal: 'brak producenta — podpowiedzi o funkcjach',
  buildImportDoneProposal: 'brak producenta — podsumowanie importu historii',
  buildBatchProposal: 'brak producenta — P-02, paczka szkiców',
  buildFinalInvoiceProposal: 'brak producenta — faktura końcowa do zaliczek',
  buildMilestoneProposal: 'brak producenta — kamienie milowe',
  buildRateRaiseProposal: 'brak producenta — propozycja podwyżki stawki',
  buildMonthClosePackageProposal: 'brak producenta — B-01, paczka dla księgowej',
  buildDeliveryProposal: 'brak producenta — B-01, doręczenie paczki',
  buildAnnexProposal: 'brak producenta — B-01, aneks do paczki',
};

/** Rodzaje kart stojące za wpisami „bramka prawna". */
const ZABLOKOWANE_RODZAJE: Record<string, FloProposalKind> = {
  buildForeignProposal: 'contractor.foreign',
  buildPaymentScoreProposal: 'payment.score',
  buildReliefProposal: 'tax.relief',
  buildSetAsideProposal: 'tax.setaside',
  buildVatLimitProposal: 'tax.limit',
};

describe('skan — czy w ogóle coś widzi', () => {
  it('czyta kod produkcyjny', () => {
    expect(KOD.size).toBeGreaterThan(200);
    expect(PLIKI_FLO.length).toBeGreaterThan(40);
  });

  it('znajduje buildery propozycji', () => {
    // Gdyby konwencja nazw się zmieniła, ten test ma paść głośno, a nie
    // przejść na zero znalezionych budowniczych.
    expect(BUDOWNICZOWIE.length).toBeGreaterThan(25);
  });

  it('rozpoznaje moduły podpięte przez sąsiada w tym samym pliku', () => {
    // W-03: builder wołany wyłącznie przez `proposeRuleAfterReview`.
    expect(NIEPODPIETE).not.toContain('buildRuleProposal');
    // K-01: builder zbiorczy wołany przez builder jednej faktury.
    expect(NIEPODPIETE).not.toContain('buildPaymentConfirmProposal');
  });
});

describe('każda zbudowana funkcja jest podpięta albo zapisana jako dług', () => {
  it('nowy niepodpięty builder nie przejdzie po cichu', () => {
    const nieznane = NIEPODPIETE.filter((n) => !(n in ZNANY_DLUG));

    expect(
      nieznane,
      'Zbudowano builder propozycji, którego nikt nie woła. Podepnij go ' +
        'do producenta albo dopisz do ZNANY_DLUG z powodem.',
    ).toEqual([]);
  });

  it('lista długu nie trzyma wpisów, które już są podpięte', () => {
    // Bez tego lista gnije w drugą stronę: ktoś podpina funkcję, wpis
    // zostaje, a po roku nikt nie wie, co jest prawdą.
    const nieaktualne = Object.keys(ZNANY_DLUG).filter(
      (n) => !NIEPODPIETE.includes(n),
    );

    expect(
      nieaktualne,
      'Te buildery są już podpięte — usuń je z ZNANY_DLUG.',
    ).toEqual([]);
  });

  it('każdy wpis długu ma powód', () => {
    for (const [nazwa, powod] of Object.entries(ZNANY_DLUG)) {
      expect(powod.length, nazwa).toBeGreaterThan(10);
    }
  });
});

describe('dług „bramka prawna" zgadza się z kodem', () => {
  it('rodzaje opisane jako zablokowane naprawdę są zablokowane w flags.ts', () => {
    // Powód wpisany ręcznie potrafi skłamać. Ten test wiąże go z jedynym
    // miejscem, które o blokadzie decyduje.
    for (const [builder, kind] of Object.entries(ZABLOKOWANE_RODZAJE)) {
      expect(ZNANY_DLUG[builder], builder).toContain('bramka prawna');
      expect(kindStatus(kind).enabled, `${builder} → ${kind}`).toBe(false);
    }
  });

  it('odblokowanie rodzaju w kodzie przeterminowuje wpis długu', () => {
    // Gdy prawnik zapali zielone światło i ktoś zdejmie blokadę z `flags.ts`,
    // powód „bramka prawna" przestaje być prawdą — a ten test o tym powie.
    const klamiace = Object.entries(ZABLOKOWANE_RODZAJE).filter(
      ([, kind]) => kindStatus(kind).enabled,
    );

    expect(
      klamiace.map(([builder]) => builder),
      'Rodzaj został odblokowany w flags.ts — popraw powód w ZNANY_DLUG.',
    ).toEqual([]);
  });
});

describe('bramka przed odczytem nie wycina trybu cichego', () => {
  it('żaden producent nie kończy na gołym `!verdict.enabled`', () => {
    // 24.09: sześciu producentów miało `if (!verdict.enabled) return` przed
    // odczytem danych. Oszczędność rozsądna — tylko że obejmowała też konto
    // POZA KANARKIEM, czyli dziś każde konto na produkcji. Tryb cichy nie
    // zapisał dla tych reguł ani jednego wpisu, a testy były zielone.
    //
    // Testy producentów łapią powrót błędu w ISTNIEJĄCYCH regułach. Ten
    // łapie go w regule, której jeszcze nie ma: bramka ma iść przez
    // `shouldCompute`, które przepuszcza kanarka do liczenia.
    const goleBramki = /if\s*\(\s*!\s*verdict\.enabled\s*\)/;

    const winni = PLIKI_FLO.filter((plik) => plik.startsWith('lib/flo/functions/')).filter(
      (plik) => goleBramki.test(KOD.get(plik) ?? ''),
    );

    expect(
      winni,
      'Bramka przed odczytem wycina też kanarka — użyj shouldCompute(verdict) ' +
        'z lib/flo/kind-switch.ts, inaczej tryb cichy tej reguły nie zbierze nic.',
    ).toEqual([]);
  });
});

describe('każdy przebieg reguły jest w pulsie', () => {
  it('nowy producent bez wpisu w tablicy RULES nie przejdzie', () => {
    // K1.3 zrobiło z pulsu tablicę, żeby nowa reguła była jedną pozycją.
    // Jedna pozycja, o której łatwo zapomnieć — stąd ten test.
    const tick = KOD.get('lib/flo/tick.ts') ?? '';

    const pominiete = PLIKI_FLO.filter((p) => p.startsWith('lib/flo/functions/'))
      .flatMap((plik) =>
        [...(KOD.get(plik) ?? '').matchAll(/^export async function (run\w*Sweep)/gm)].map(
          (m) => m[1]!,
        ),
      )
      .filter((nazwa) => !new RegExp(`\\b${nazwa}\\b`).test(tick));

    expect(
      pominiete,
      'Producent ma przebieg, ale puls go nie woła — dopisz pozycję do RULES.',
    ).toEqual([]);
  });
});
