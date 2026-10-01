import type { CachedValidationResult } from './cache';

export interface ContractorValidationPatch {
  vat_status: CachedValidationResult['vatStatus'];
  last_validation_at: string;
  last_validation_source: CachedValidationResult['source'];
  bank_accounts_validated: string[];
  validation_warning: string | null;
}

/**
 * Wynik walidacji Biała Lista/VIES do zapisu w `contractors` — wspólny dla
 * ręcznego sprawdzenia, walidacji zbiorczej i nocnej re-walidacji.
 *
 * `null`, gdy API było chwilowo niedostępne: nie nadpisujemy ostatniego
 * dobrego statusu VAT ani zweryfikowanych rachunków (od nich zależy np.
 * ostrzeżenie o przelewie na rachunek spoza białej listy) i nie przesuwamy
 * `last_validation_at`, żeby kolejny przebieg spróbował znowu.
 */
export function contractorValidationPatch(
  result: CachedValidationResult,
  now: Date = new Date(),
): ContractorValidationPatch | null {
  if (result.unavailable) return null;
  return {
    vat_status: result.vatStatus,
    last_validation_at: now.toISOString(),
    last_validation_source: result.source,
    bank_accounts_validated: result.bankAccounts,
    validation_warning: result.warning ?? null,
  };
}
