/**
 * P-09 — kontrahent z zagranicy (krok 45 planu). ⚠️ ŻÓŁTE, ZA FLAGĄ.
 *
 * TO JEST JEDYNA FUNKCJA W CAŁYM AGENCIE, KTÓREJ DOMYŚLNĄ ODPOWIEDZIĄ JEST
 * „ZAPYTAJ CZŁOWIEKA”.
 *
 * Kwalifikacja transakcji zagranicznej — czy to wewnątrzwspólnotowa dostawa,
 * eksport usług, odwrotne obciążenie, czy zwykła sprzedaż krajowa — zależy od
 * rzeczy, których agent nie widzi: gdzie usługa jest faktycznie świadczona,
 * czy nabywca jest podatnikiem, czy ma stałe miejsce prowadzenia działalności
 * w Polsce. Program, który wybiera za klienta, wybiera na podstawie połowy
 * danych i myli się w sposób, którego klient nie zauważy do kontroli.
 *
 * DLATEGO: agent NIE USTAWIA stawki VAT ani odwrotnego obciążenia. Pokazuje,
 * co dana konfiguracja zwykle oznacza, podaje dwa–trzy warianty z odnośnikiem
 * do artykułu i zostawia decyzję. Każda karta kończy się odesłaniem do
 * księgowej. Osobny test pilnuje, żeby w ładunku nie było pola ze stawką —
 * bo dopóki go nie ma, nikt nie zbuduje interfejsu, który ją ustawia.
 *
 * KURS: `lib/flo/nbp.ts`, reguła „ostatnia tabela opublikowana PRZED datą”.
 * Brak kursu = jawny komunikat, nigdy podstawienie.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import {
  describeMissingRate,
  rateBefore,
  stampRate,
  type NbpRate,
  type RateStamp,
} from '@/lib/flo/nbp';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { EU_COUNTRY_CODES } from '@/lib/validation/vies-client';

const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════
// Rozpoznanie sytuacji
// ═══════════════════════════════════════════════════════════════

export type ForeignCase =
  /** Kontrahent z UE z potwierdzonym numerem VAT UE. */
  | 'eu_vat_registered'
  /** Kontrahent z UE bez potwierdzonego numeru VAT UE. */
  | 'eu_no_vat'
  /** Kontrahent spoza UE. */
  | 'outside_eu';

export interface ForeignContractor {
  countryCode: string;
  /** Numer VAT UE potwierdzony w VIES. */
  viesValid: boolean;
}

export function isEuCountry(countryCode: string): boolean {
  return (EU_COUNTRY_CODES as readonly string[]).includes(
    countryCode.trim().toUpperCase(),
  );
}

export function classifyForeign(contractor: ForeignContractor): ForeignCase {
  if (!isEuCountry(contractor.countryCode)) return 'outside_eu';
  return contractor.viesValid ? 'eu_vat_registered' : 'eu_no_vat';
}

// ═══════════════════════════════════════════════════════════════
// Warianty — opisy, nie ustawienia
// ═══════════════════════════════════════════════════════════════

export interface ForeignOption {
  /** Krótka nazwa wariantu. */
  label: string;
  /** Co to zwykle oznacza. NIGDY „ustawimy Ci tak”. */
  note: string;
}

/**
 * Dwa–trzy warianty do pokazania. To są OPISY, nie decyzje.
 *
 * Każdy zaczyna się od „zwykle”, bo każdy z nich bywa nieprawdziwy przy
 * okolicznościach, których agent nie zna.
 */
export function foreignOptions(situation: ForeignCase): ForeignOption[] {
  switch (situation) {
    case 'eu_vat_registered':
      return [
        {
          label: 'Usługa dla firmy z UE',
          note: 'Zwykle rozlicza ją nabywca w swoim kraju, a na fakturze nie ma polskiego VAT-u.',
        },
        {
          label: 'Towar wysyłany do UE',
          note: 'Zwykle dostawa wewnątrzwspólnotowa, ale zależy od tego, czy masz dowody wywozu.',
        },
        {
          label: 'Usługa związana z nieruchomością w Polsce',
          note: 'Zwykle polski VAT mimo zagranicznego nabywcy — decyduje miejsce nieruchomości.',
        },
      ];

    case 'eu_no_vat':
      return [
        {
          label: 'Nabywca to firma, ale numer się nie potwierdził',
          note: 'Zwykle trzeba poprosić o poprawny numer VAT UE przed wystawieniem — bez niego rozliczenie wygląda inaczej.',
        },
        {
          label: 'Nabywca to osoba prywatna',
          note: 'Zwykle polski VAT, tak jak przy sprzedaży krajowej. Przy większej skali dochodzą progi sprzedaży wysyłkowej.',
        },
      ];

    case 'outside_eu':
      return [
        {
          label: 'Usługa dla firmy spoza UE',
          note: 'Zwykle poza polskim VAT-em, ale liczy się miejsce świadczenia, nie adres nabywcy.',
        },
        {
          label: 'Eksport towaru',
          note: 'Zwykle stawka 0%, pod warunkiem że masz dokument potwierdzający wywóz poza UE.',
        },
      ];
  }
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export interface ForeignProposalInput {
  tenantId: string;
  contractorId: string;
  contractorName: string;
  contractor: ForeignContractor;
  /** Waluta faktury; `PLN` oznacza, że kurs nie jest potrzebny. */
  currency: string;
  /** Data, dla której szukamy kursu (data zdarzenia), ISO. */
  rateDate: string;
  /** Lokalny zapas tabel NBP. */
  tables: readonly NbpRate[];
  now?: Date;
}

export interface ForeignProposalResult {
  proposal: CreateProposalInput;
  /** Ślad kursu do zapisania przy fakturze; `null`, gdy kursu nie ma. */
  rate: RateStamp | null;
}

export function buildForeignProposal(
  input: ForeignProposalInput,
): ForeignProposalResult {
  const now = input.now ?? new Date();
  const situation = classifyForeign(input.contractor);
  const options = foreignOptions(situation);
  const country = input.contractor.countryCode.trim().toUpperCase();

  const needsRate = input.currency.trim().toUpperCase() !== 'PLN';
  const lookup = needsRate
    ? rateBefore(input.tables, input.currency, input.rateDate)
    : null;

  const rate = lookup?.found ? stampRate(lookup.rate, input.rateDate) : null;

  return {
    rate,
    proposal: {
      tenantId: input.tenantId,
      kind: 'contractor.foreign',
      topicKey: `contractor.foreign:${input.contractorId}`,
      title: `${input.contractorName} — kontrahent z ${country}`,
      body:
        `${describeSituation(situation)} ` +
        `${describeRate(lookup, input.currency, input.rateDate)} ` +
        // KAŻDA karta tej funkcji kończy się tak samo. To nie jest asekuracja,
        // tylko jedyna uczciwa końcówka: kwalifikacja transakcji zagranicznej
        // zależy od okoliczności, których agent nie widzi.
        'Nie ustawiam za Ciebie stawki VAT — pokaż to księgowej.',
      fingerprint: fingerprintOf({
        contractor: input.contractorId,
        situation,
        rate: rate?.mid ?? null,
      }),
      expiresAt: new Date(now.getTime() + 30 * DAY_MS),
      priority: 28,
      payload: {
        contractorId: input.contractorId,
        countryCode: country,
        situation,
        // OPISY, nie ustawienia. W ładunku NIE MA I NIE BĘDZIE pola ze stawką
        // VAT — dopóki go nie ma, nikt nie zbuduje interfejsu, który ją
        // ustawia „jednym kliknięciem".
        options,
        // Kurs jest FAKTEM (numer tabeli, data), nie decyzją podatkową.
        rateStamp: rate,
        rateMissing: needsRate && !rate,
        primaryIntent: 'open',
        primaryLabel: 'Zobacz warianty',
      },
      evidence: [
        { label: 'Dane kontrahenta', href: `/contractors/${input.contractorId}` },
        {
          label: 'Sprzedaż za granicę — co to zmienia',
          href: '/pomoc/faktury-walutowe',
        },
        ...(rate
          ? [
              {
                label: `Kurs ${rate.currency} ${rate.mid} — tabela ${rate.tableNo} z ${rate.effectiveDate}`,
                href: '/invoices',
              },
            ]
          : []),
      ],
    },
  };
}

function describeSituation(situation: ForeignCase): string {
  switch (situation) {
    case 'eu_vat_registered':
      return 'Numer VAT UE potwierdzony w VIES.';
    case 'eu_no_vat':
      return 'Kontrahent z Unii, ale numeru VAT UE nie udało się potwierdzić.';
    case 'outside_eu':
      return 'Kontrahent spoza Unii Europejskiej.';
  }
}

function describeRate(
  lookup: ReturnType<typeof rateBefore> | null,
  currency: string,
  date: string,
): string {
  if (!lookup) return '';
  if (lookup.found) {
    return `Kurs ${currency.toUpperCase()}: ${lookup.rate.mid} z tabeli ${lookup.rate.tableNo} (${lookup.rate.effectiveDate}).`;
  }
  return describeMissingRate(lookup.reason, currency, date);
}
