/**
 * T-05 — ile odłożyć na podatek (krok 39 planu).
 *
 * ⚠️ FUNKCJA ZA FLAGĄ (`tax.setaside`) i za bramką M12.
 *
 * CO ROBI: po każdej potwierdzonej wpłacie (K-01) mówi, ile z tych pieniędzy
 * nie jest jeszcze klienta. To najprostsza i najczęściej łamana zasada
 * prowadzenia jednoosobowej firmy — a agent jest jedyną rzeczą w tym
 * produkcie, która widzi wpłatę w momencie, w którym jeszcze nie została
 * wydana.
 *
 * TRZY AWARIE:
 *
 * 1. LICZNIK, KTÓRY WYGLĄDA JAK PORTFEL. Gdyby ta karta pokazywała saldo,
 *    klient zacząłby ją czytać jak konto: „mam odłożone 3 200” zamienia się
 *    w poczucie posiadania, a stąd już blisko do „to wezmę z tego 500”.
 *    Obrona jest w KONTRAKCIE, nie w wyglądzie: ładunek celowo NIE NIESIE
 *    salda, dostępnych środków ani postępu — z tego, co wysyłamy, nie da się
 *    zbudować widoku portfela. Formuła jest zadaniowa: „do odłożenia w tym
 *    miesiącu”, z ręcznym potwierdzeniem „odłożyłem”. Osobny test skanuje
 *    ładunek pod kątem zakazanych pól.
 *
 * 2. PROCENT OD POJEDYNCZEJ FAKTURY. Naiwne „19% z każdej wpłaty” jest złe
 *    u każdego, kto ma koszty: klient odkłada za dużo przez cały rok, więc
 *    przestaje odkładać w ogóle. Licznik jest NARASTAJĄCY NA OKRESIE
 *    i uwzględnia koszty; przy ryczałcie liczy od przychodu, bo tam to
 *    poprawne.
 *
 * 3. ZMIANA FORMY OPODATKOWANIA W TRAKCIE OKRESU. Zastosowanie nowej stawki
 *    tylko do kolejnych wpłat zostawia okres policzony dwiema miarami naraz.
 *    Licznik przelicza CAŁY OKRES od początku — a gdy z przeliczenia wychodzi
 *    mniej, niż klient już odłożył, agent mówi „w tym miesiącu nie musisz
 *    odkładać nic”, i nigdy „wypłać sobie nadwyżkę”.
 *
 * CO JEST LICZONE, A CO NIE — świadome zawężenie:
 * liczymy PODATEK DOCHODOWY. Składka zdrowotna NIE jest wliczona, bo jej
 * podstawa i wzór różnią się dla każdej formy opodatkowania — plan wymienia
 * ją wprost na liście pozycji, których agent nie ma prawa liczyć bez opinii
 * (T-04). Zamiast policzyć ją źle, mówimy wprost, czego w liczbie nie ma.
 * Rozszerzenie wymaga potwierdzenia u księgowej, tak samo jak reszta tabeli.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPln } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import type { TaxParams } from '@/lib/flo/tax-params';
import { roundToCents } from '@/lib/xml/invoice-calculator';
import type { FloTaxProfile } from '@/types/flo';

/** Poniżej tej kwoty odkładanie jest bez sensu i agent milczy. */
export const MIN_SETASIDE_PLN = 50;

export interface PeriodLedger {
  /** Okres rozliczeniowy, np. „2026-09”. */
  periodKey: string;
  /** Przychód narastająco w okresie — potwierdzone wpłaty. */
  income: number;
  /** Koszty uznane w okresie. */
  costs: number;
  /** Ile klient już potwierdził, że odłożył. */
  alreadySetAside: number;
}

export interface SetAsideResult {
  /** Podstawa opodatkowania po regułach formy. */
  base: number;
  /** Należny podatek za okres, narastająco. */
  tax: number;
  /** Ile jeszcze zostało do odłożenia; nigdy poniżej zera. */
  toSetAside: number;
  /** Czy klient odłożył już więcej, niż wychodzi. */
  overpaid: boolean;
  /** Wzór do pokazania człowiekowi. */
  formula: string;
  /** Czego w tej liczbie NIE MA. */
  excluded: string[];
}

/**
 * Podatek za okres — narastająco, według formy z profilu.
 *
 * Stawka pochodzi WYŁĄCZNIE z profilu. Ryczałt bez zadeklarowanej stawki
 * zwraca `null`: agent nie wybiera jednej z kilkunastu stawek za człowieka.
 */
export function computeSetAside(input: {
  profile: FloTaxProfile;
  ledger: PeriodLedger;
  params: TaxParams;
}): SetAsideResult | null {
  const { profile, ledger, params } = input;

  if (profile.form === 'nieznana') return null;
  if (profile.form === 'ryczalt' && !profile.ryczaltRate) return null;

  const base =
    profile.form === 'ryczalt'
      ? // Ryczałt liczy się OD PRZYCHODU. Odjęcie kosztów byłoby tu błędem,
        // a nie uprzejmością — zaniżyłoby odkładaną kwotę.
        roundToCents(ledger.income)
      : Math.max(0, roundToCents(ledger.income - ledger.costs));

  const { tax, formula } = taxFor(profile, base, params);
  const remaining = roundToCents(tax - ledger.alreadySetAside);

  return {
    base,
    tax,
    toSetAside: Math.max(0, remaining),
    overpaid: remaining < 0,
    formula,
    excluded: [
      'składka zdrowotna (liczona inaczej dla każdej formy)',
      'składki ZUS',
      'ulgi i wspólne rozliczenie',
    ],
  };
}

function taxFor(
  profile: FloTaxProfile,
  base: number,
  params: TaxParams,
): { tax: number; formula: string } {
  if (profile.form === 'ryczalt') {
    const rate = profile.ryczaltRate!;
    return {
      tax: roundToCents(base * rate),
      formula: `${formatPln(base)} przychodu × ${pct(rate)} ryczałtu`,
    };
  }

  if (profile.form === 'liniowy') {
    return {
      tax: roundToCents(base * params.pitFlatRate),
      formula: `(${formatPln(base)} dochodu) × ${pct(params.pitFlatRate)}`,
    };
  }

  // Skala. Kwota wolna zastosowana jako pomniejszenie podstawy — uproszczenie
  // wymienione na liście „czego tu nie ma”, świadome i udokumentowane.
  const taxable = Math.max(0, base - params.pitTaxFreeAmount);
  if (base <= params.pitScaleThreshold) {
    return {
      tax: roundToCents(taxable * params.pitScaleLowRate),
      formula: `(${formatPln(base)} − ${formatPln(params.pitTaxFreeAmount)}) × ${pct(params.pitScaleLowRate)}`,
    };
  }

  const lowPart = roundToCents(
    (params.pitScaleThreshold - params.pitTaxFreeAmount) * params.pitScaleLowRate,
  );
  const highPart = roundToCents(
    (base - params.pitScaleThreshold) * params.pitScaleHighRate,
  );

  return {
    tax: roundToCents(lowPart + highPart),
    formula:
      `do ${formatPln(params.pitScaleThreshold)} × ${pct(params.pitScaleLowRate)}, ` +
      `powyżej × ${pct(params.pitScaleHighRate)}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

/**
 * POLA ZAKAZANE W ŁADUNKU T-05.
 *
 * Lista istnieje po to, żeby test mógł ją wyegzekwować. Zasada „licznik nie
 * może wyglądać jak portfel” jest nie do obrony w samym wyglądzie: dopóki
 * serwer wysyła saldo, prędzej czy później ktoś je narysuje — w dobrej
 * wierze, przy okazji innego zadania.
 */
export const FORBIDDEN_PAYLOAD_KEYS = [
  'balance',
  'saldo',
  'available',
  'total',
  'progress',
  'accountNumber',
  'transferUrl',
] as const;

export function buildSetAsideProposal(input: {
  tenantId: string;
  profile: FloTaxProfile;
  ledger: PeriodLedger;
  params: TaxParams;
  /** Kwota wpłaty, która wywołała przeliczenie. */
  paymentAmount: number;
  now?: Date;
}): CreateProposalInput | null {
  const result = computeSetAside(input);
  if (!result) return null;
  if (result.toSetAside < MIN_SETASIDE_PLN && !result.overpaid) return null;

  const now = input.now ?? new Date();

  return {
    tenantId: input.tenantId,
    kind: 'tax.setaside',
    // Jeden okres = jedna karta. Karta aktualizuje się po każdej wpłacie,
    // zamiast rosnąć w stos dwunastu kart w miesiącu.
    topicKey: `tax.setaside:${input.ledger.periodKey}`,
    title: result.overpaid
      ? 'W tym miesiącu nie musisz już nic odkładać'
      : `Do odłożenia: ${formatPln(result.toSetAside)}`,
    body: result.overpaid
      ? `Wpłynęło ${formatPln(input.paymentAmount)}. Odłożyłeś już tyle, ile wychodzi za ten okres — reszta jest Twoja.`
      : `Wpłynęło ${formatPln(input.paymentAmount)}. Odłóż ${formatPln(result.toSetAside)} na podatek — reszta jest Twoja.`,
    fingerprint: fingerprintOf({
      period: input.ledger.periodKey,
      tax: result.tax,
      setAside: input.ledger.alreadySetAside,
    }),
    // Karta żyje do końca miesiąca — domknięcie okresu przyniesie korektę.
    expiresAt: endOfMonth(now),
    priority: 45,
    payload: {
      periodKey: input.ledger.periodKey,
      // Wyłącznie kwota ZADANIA. Ani salda, ani „odłożone dotąd”, ani
      // procentu wypełnienia — patrz FORBIDDEN_PAYLOAD_KEYS.
      toSetAside: result.toSetAside,
      primaryLabel: 'Odłożyłem',
    },
    evidence: [
      { label: result.formula, href: '/reports' },
      { label: `Nie wliczono: ${result.excluded.join(', ')}`, href: '/reports' },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Korekta w domknięciu miesiąca
// ═══════════════════════════════════════════════════════════════

export interface SetAsideCorrection {
  /** Ile klient odłożył. */
  setAside: number;
  /** Ile wychodzi po domknięciu okresu. */
  due: number;
  /** Dodatnie = dołóż; ujemne = odłożone z zapasem. */
  delta: number;
  sentence: string;
}

/**
 * „Odłożone 3 200, wychodzi 3 480 — dołóż 280”.
 *
 * Przy nadwyżce NIE PADA propozycja wypłacenia sobie różnicy. Nadwyżka
 * z jednego miesiąca jest zaliczką na kolejny, a agent, który zachęca do
 * sięgnięcia po odłożone pieniądze, pracuje przeciwko własnej funkcji.
 */
export function buildCorrection(input: {
  profile: FloTaxProfile;
  ledger: PeriodLedger;
  params: TaxParams;
}): SetAsideCorrection | null {
  const result = computeSetAside(input);
  if (!result) return null;

  const delta = roundToCents(result.tax - input.ledger.alreadySetAside);

  return {
    setAside: input.ledger.alreadySetAside,
    due: result.tax,
    delta,
    sentence:
      delta > 0
        ? `Odłożone ${formatPln(input.ledger.alreadySetAside)}, wychodzi ${formatPln(result.tax)} — dołóż ${formatPln(delta)}.`
        : delta < 0
          ? `Odłożone ${formatPln(input.ledger.alreadySetAside)}, wychodzi ${formatPln(result.tax)}. Nadwyżka zostaje na kolejny okres.`
          : `Odłożone ${formatPln(input.ledger.alreadySetAside)} — dokładnie tyle, ile wychodzi.`,
  };
}

function pct(rate: number): string {
  return `${String(roundToCents(rate * 100)).replace('.', ',')}%`;
}

function endOfMonth(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
  );
}
