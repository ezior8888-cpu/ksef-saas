/**
 * Profil podatkowy i bramka grupy T (krok 35 planu, mechanizm M12).
 *
 * ZASADA: BEZ PROFILU CAŁA GRUPA PODATKOWA MILCZY.
 *
 * Powód nie jest techniczny. Agent, który nie wie, czy klient rozlicza się
 * na skali, liniowo czy ryczałtem, i czy jest podatnikiem VAT, może co
 * najwyżej zgadywać — a zgadnięty termin albo zgadnięty limit to komunikat
 * gorszy od milczenia. Klient dostaje wtedy stres z powodu obowiązku,
 * który go nie dotyczy, albo — dużo gorzej — spokój co do obowiązku,
 * który go dotyczy.
 *
 * Bramka stoi w `createProposal`, a nie w każdej z pięciu funkcji grupy T.
 * Warunek sprawdzany w jednym miejscu nie da się pominąć przez pomyłkę
 * w szóstej funkcji, którą ktoś dopisze za rok.
 *
 * DRUGI WARUNEK: `PARAMS_VERIFIED` w `lib/flo/tax-params.ts`. Sam profil
 * nie wystarczy, jeżeli tabela limitów i terminów nie została sprawdzona
 * przez człowieka.
 */

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { PARAMS_VERIFIED } from '@/lib/flo/tax-params';
import type { FloProposalKind, FloTaxProfile } from '@/types/flo';

/** Rodzaje objęte bramką. Dopisanie nowego `tax.*` wymaga wpisu tutaj. */
export const TAX_KINDS = [
  'tax.deadline',
  'tax.limit',
  'tax.relief',
  'tax.simulate',
  'tax.setaside',
] as const satisfies readonly FloProposalKind[];

export function isTaxKind(kind: FloProposalKind): boolean {
  return (TAX_KINDS as readonly string[]).includes(kind);
}

const FORMS = ['skala', 'liniowy', 'ryczalt', 'nieznana'] as const;

/**
 * Odczyt profilu z JSON-a w bazie.
 *
 * Kolumna jest typu JSONB, więc może zawierać cokolwiek — łącznie z kształtem
 * sprzed zmiany kontraktu. Zwracamy `null` zamiast rzucać wyjątkiem: brak
 * profilu jest normalnym stanem konta, a nie awarią.
 */
export function parseTaxProfile(value: unknown): FloTaxProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const form = raw.form;
  if (typeof form !== 'string' || !(FORMS as readonly string[]).includes(form)) {
    return null;
  }

  const period = raw.period;
  if (period !== 'M' && period !== 'K') return null;

  const startedOn =
    typeof raw.startedOn === 'string' && isIsoDate(raw.startedOn)
      ? raw.startedOn
      : null;

  return {
    form: form as FloTaxProfile['form'],
    vat: raw.vat === true,
    period,
    startedOn,
    ryczaltRate:
      typeof raw.ryczaltRate === 'number' && raw.ryczaltRate > 0 && raw.ryczaltRate < 1
        ? raw.ryczaltRate
        : null,
  };
}

/**
 * Czy profil nadaje się do liczenia czegokolwiek.
 *
 * `nieznana` forma opodatkowania to świadomy stan „klient jeszcze nie wie" —
 * kreator ma prawo go zapisać, a agent ma obowiązek wtedy milczeć.
 * Data rozpoczęcia działalności jest wymagana przez CAŁĄ grupę: bez niej
 * T-02 nie policzy proporcji limitu dla firmy założonej w trakcie roku,
 * a T-03 nie ma od czego odliczać ulgi.
 */
export function isTaxProfileUsable(profile: FloTaxProfile | null): boolean {
  if (!profile) return false;
  if (profile.form === 'nieznana') return false;
  if (!profile.startedOn) return false;
  return true;
}

/**
 * Czy da się z tego profilu policzyć PODATEK.
 *
 * Ryczałt bez zadeklarowanej stawki nie przechodzi. Stawek ryczałtu jest
 * kilkanaście (od 2% do 17%), zależą od rodzaju działalności, a wybór między
 * nimi jest kwalifikacją — nie zadaniem dla programu. Agent ma tu milczeć,
 * a nie wybierać „najbardziej prawdopodobną”.
 */
export function canComputeTax(profile: FloTaxProfile | null): boolean {
  if (!isTaxProfileUsable(profile)) return false;
  if (profile!.form === 'ryczalt' && !profile!.ryczaltRate) return false;
  return true;
}

/** Czego brakuje — do komunikatu kreatora, nie do karty podatkowej. */
export function missingProfileFields(profile: FloTaxProfile | null): string[] {
  if (!profile) return ['forma opodatkowania', 'data rozpoczęcia działalności'];

  const missing: string[] = [];
  if (profile.form === 'nieznana') missing.push('forma opodatkowania');
  if (!profile.startedOn) missing.push('data rozpoczęcia działalności');
  return missing;
}

/**
 * Bramka M12 — czy grupa T ma prawo się odezwać na tym koncie.
 *
 * Dwa warunki naraz: sprawdzona tabela parametrów (wspólna dla wszystkich)
 * i kompletny profil podatkowy (osobny dla każdego konta).
 */
export async function taxGateOpen(
  tenantId: string,
  db: FloDbClient = floDb(),
): Promise<boolean> {
  if (!PARAMS_VERIFIED) return false;

  const { data, error } = await db
    .from('flo_prefs')
    .select('tax_profile')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return isTaxProfileUsable(parseTaxProfile(data?.tax_profile));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  // 2026-02-31 przechodzi przez Date.parse i cofa się na 3 marca — data,
  // której nie ma w kalendarzu, nie ma prawa zostać profilem.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}
