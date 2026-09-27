/**
 * VAT do odliczenia po ręcznej poprawce kwoty VAT wydatku.
 *
 * `expenses.vat_deductible_amount` zapisują OCR i auto-kategoryzacja skrzynki
 * przy tworzeniu wydatku, a JPK_V7M odlicza właśnie tę kwotę (K_43). Poprawka
 * samego `vat_amount` zostawiała w deklaracji odczyt OCR — np. 460 zł zamiast
 * poprawionych 46 zł.
 *
 * Proporcja zostaje: pełne odliczenie dalej pełne, zerowe (np. firma
 * zwolniona z VAT) dalej zerowe, częściowe — w tej samej części.
 */
export function deductibleAfterVatChange(
  before: { vat: number; deductible: number },
  newVat: number,
): number {
  if (before.vat === 0 || before.deductible === before.vat) return newVat;
  return Math.round(newVat * (before.deductible / before.vat) * 100) / 100;
}
