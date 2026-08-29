/**
 * P-08 — prześwietlenie kontrahenta (krok 44 planu).
 *
 * Agent sprawdza kontrahenta w rejestrach (GUS, biała lista VAT, VIES) przy
 * każdym szkicu i nocą dla całej bazy. Ale prawie zawsze KONIEC NA TYM —
 * ta funkcja jest w 95% przypadków funkcją milczącą, i to jest jej sens.
 *
 * TRZY AWARIE:
 *
 * 1. FAŁSZYWY ALARM NA KIMŚ, KTO NIE MA PRAWA BYĆ W REJESTRZE. Osoba
 *    fizyczna nieprowadząca działalności nie ma wpisu na białej liście.
 *    Podatnik zwolniony podmiotowo też nie jest „czynny”. Logika dwustanowa
 *    („jest / nie ma”) oznaczyłaby oboje jako podejrzanych — czyli agent
 *    straszyłby przy połowie faktur naszej grupy docelowej, aż klient
 *    przestałby czytać ostrzeżenia w ogóle. Obrona: TRZY STANY, a ostrzega
 *    wyłącznie trzeci. Osoby fizyczne i podmioty zwolnione — NIGDY.
 *
 * 2. NADPISANIE RĘCZNEJ POPRAWKI KLIENTA. Klient poprawił nazwę kontrahenta,
 *    bo w rejestrze stoi wersja stara albo skrócona. Nocne odświeżenie
 *    wraca do wersji z rejestru. Klient poprawia drugi raz, trzeci —
 *    i przestaje ufać całej automatyzacji, słusznie. Obrona: `manual_fields`
 *    (migracja 00064), znacznik TRWAŁY i per pole.
 *
 * 3. AWARIA REJESTRU BLOKUJE WYSTAWIENIE FAKTURY (M17). Biała lista bywa
 *    niedostępna, a klient ma fakturę do wystawienia dzisiaj. Cudze API,
 *    które zatrzymuje pracę, jest gorsze niż brak tego API. Obrona: awaria
 *    NIGDY nie blokuje; ponowna próba w tle, informacja po fakcie.
 *
 * TON: „sprawdź przed wystawieniem”, NIGDY „nie wystawiaj”. Wykreślenie
 * z rejestru VAT nie jest zakazem współpracy — jest informacją, która zmienia
 * sposób rozliczenia. Agent nie wie, czy klient ma powód wystawić tę fakturę.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import type { CachedVatStatus } from '@/lib/validation/cache';

const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════
// Trzy stany zamiast dwóch
// ═══════════════════════════════════════════════════════════════

export type RegistryState =
  /** Jest w rejestrze i wszystko gra — także podatnik zwolniony. */
  | 'active'
  /** Nie ma wpisu. To NIE JEST zarzut: osoby fizyczne go nie mają. */
  | 'not_listed'
  /** BYŁ w rejestrze i został wykreślony. Tylko to uruchamia ostrzeżenie. */
  | 'removed'
  /** Rejestr nie odpowiedział — stan nieznany, nie stan zły. */
  | 'unavailable';

export interface RegistryLookup {
  /** Status z białej listy / cache walidacji. */
  vatStatus: CachedVatStatus;
  /** Czy rejestr w ogóle zwrócił wpis. */
  found: boolean;
  /** Czy zapytanie doszło do skutku. `false` = awaria rejestru. */
  reachable: boolean;
  /** Czy kontrahent to osoba fizyczna nieprowadząca działalności. */
  isNaturalPerson: boolean;
}

/**
 * Klasyfikacja wyniku z rejestru — funkcja czysta.
 *
 * `exempt` (zwolniony podmiotowo) jest stanem NORMALNYM, nie brakiem:
 * tak wygląda w rejestrze większość naszych własnych klientów.
 */
export function classifyRegistry(lookup: RegistryLookup): RegistryState {
  if (!lookup.reachable) return 'unavailable';
  if (lookup.isNaturalPerson) return 'not_listed';

  switch (lookup.vatStatus) {
    case 'active':
    case 'exempt':
      return 'active';
    case 'inactive':
      // Wykreślenie ma sens tylko dla kogoś, kto w rejestrze był.
      return lookup.found ? 'removed' : 'not_listed';
    case 'unknown':
      return 'not_listed';
  }
}

/**
 * Czy w ogóle się odzywać.
 *
 * Jedyny stan, który uruchamia ostrzeżenie, to wykreślenie. Brak wpisu jest
 * codziennością u osób fizycznych i podmiotów zwolnionych — ostrzeganie
 * o nim zamieniłoby funkcję w szum, a szum uczy klienta klikać „ukryj”
 * bez czytania. Wtedy nie zadziała też to jedno ostrzeżenie, które ma znaczenie.
 */
export function shouldWarn(state: RegistryState): boolean {
  return state === 'removed';
}

// ═══════════════════════════════════════════════════════════════
// Ręczne poprawki — nigdy nie nadpisywane
// ═══════════════════════════════════════════════════════════════

/** Pola kontrahenta, które w ogóle podlegają odświeżaniu z rejestrów. */
export const REFRESHABLE_FIELDS = [
  'name',
  'address',
  'vat_status',
  'bank_accounts_validated',
] as const;

export type RefreshableField = (typeof REFRESHABLE_FIELDS)[number];

export interface MergeResult<T> {
  merged: T;
  /** Pola pominięte, bo człowiek je poprawił. */
  skipped: RefreshableField[];
}

/**
 * Scalenie danych z rejestru z tym, co jest w bazie — funkcja czysta.
 *
 * ZASADA: pole z listy `manualFields` NIE JEST NIGDY nadpisywane. Znacznik
 * jest trwały i znika wyłącznie wtedy, gdy człowiek sam cofnie poprawkę.
 *
 * Znacznik działa PER POLE, a nie na całym rekordzie: poprawiona nazwa nie
 * ma powodu blokować odświeżania statusu VAT, który jest jedyną rzeczą,
 * o którą w tej funkcji naprawdę chodzi.
 */
export function mergeRegistryData<T extends Partial<Record<RefreshableField, unknown>>>(
  current: T,
  incoming: Partial<Record<RefreshableField, unknown>>,
  manualFields: readonly string[],
): MergeResult<T> {
  const merged = { ...current };
  const skipped: RefreshableField[] = [];

  for (const field of REFRESHABLE_FIELDS) {
    if (!(field in incoming)) continue;

    if (manualFields.includes(field)) {
      skipped.push(field);
      continue;
    }

    (merged as Record<string, unknown>)[field] = incoming[field];
  }

  return { merged, skipped };
}

/** Dopisanie znacznika po ręcznej edycji. Idempotentne. */
export function markManual(
  manualFields: readonly string[],
  edited: readonly RefreshableField[],
): string[] {
  return [...new Set([...manualFields, ...edited])].sort();
}

// ═══════════════════════════════════════════════════════════════
// M17 — awaria rejestru nie blokuje pracy
// ═══════════════════════════════════════════════════════════════

/** Po ilu minutach ponawiamy sprawdzenie po awarii rejestru. */
export const RETRY_AFTER_MINUTES = 30;

export interface OutagePlan {
  /** Czy wolno wystawić fakturę mimo braku odpowiedzi z rejestru. */
  blocksInvoicing: false;
  retryAt: string;
  /** Czy klient ma się o tym dowiedzieć TERAZ. */
  tellNow: false;
}

/**
 * Co robimy, gdy rejestr nie odpowiada.
 *
 * Typy pól są przybite na `false` celowo: to nie są ustawienia, tylko
 * gwarancja. Cudze API, które zatrzymuje pracę klienta, jest gorsze niż
 * brak tego API — a komunikat „nie mogłem sprawdzić kontrahenta” w chwili
 * wystawiania faktury jest zawracaniem głowy sprawą, na którą klient i tak
 * nic nie poradzi. Sprawdzamy ponownie w tle i mówimy tylko wtedy, gdy
 * naprawdę jest co powiedzieć.
 */
export function planAfterOutage(now: Date): OutagePlan {
  return {
    blocksInvoicing: false,
    retryAt: new Date(now.getTime() + RETRY_AFTER_MINUTES * 60_000).toISOString(),
    tellNow: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export interface ContractorCheckInput {
  tenantId: string;
  contractorId: string;
  contractorName: string;
  lookup: RegistryLookup;
  /** Data wykreślenia z rejestru, jeżeli rejestr ją podał; ISO. */
  removalDate?: string | null;
  /** Czy sprawdzenie było ponowieniem po awarii — zmienia treść. */
  afterRetry?: boolean;
  now?: Date;
}

export function buildContractorCheckProposal(
  input: ContractorCheckInput,
): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const state = classifyRegistry(input.lookup);
  if (!shouldWarn(state)) return null;

  const since = input.removalDate ? ` (od ${formatFullDate(input.removalDate)})` : '';

  return {
    tenantId: input.tenantId,
    kind: 'contractor.check',
    // Jeden kontrahent = jedna karta. Powtórne sprawdzenia aktualizują ją,
    // zamiast układać stos identycznych ostrzeżeń.
    topicKey: `contractor.check:${input.contractorId}`,
    title: `${input.contractorName} — wykreślony z rejestru VAT`,
    // „SPRAWDŹ PRZED WYSTAWIENIEM", nigdy „nie wystawiaj". Wykreślenie nie
    // jest zakazem współpracy, tylko informacją, która zmienia sposób
    // rozliczenia — a agent nie wie, czy klient ma powód wystawić tę fakturę.
    body:
      `Biała lista pokazuje go jako wykreślonego${since}. ` +
      (input.afterRetry
        ? 'Sprawdziłem ponownie, bo przy pierwszym podejściu rejestr nie odpowiadał. '
        : '') +
      'Sprawdź to przed wystawieniem kolejnej faktury — przy wykreślonym ' +
      'kontrahencie inaczej wygląda odliczenie i płatność na rachunek z wykazu.',
    fingerprint: fingerprintOf({
      contractor: input.contractorId,
      state,
      removal: input.removalDate ?? null,
    }),
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    priority: 22,
    payload: {
      contractorId: input.contractorId,
      registryState: state,
      // Agent nie wystawia i nie blokuje wystawienia — prowadzi do danych.
      primaryIntent: 'open',
      primaryLabel: 'Otwórz kontrahenta',
    },
    evidence: [
      { label: 'Dane kontrahenta', href: `/contractors/${input.contractorId}` },
      { label: 'Faktury dla tego kontrahenta', href: '/invoices' },
    ],
  };
}

function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}.${month}.${year}`;
}
