import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAX_OFFICE_CODE,
  resolveTaxOfficeCode,
} from '@/lib/exports/jpk-fa-generator';

/**
 * QA-3 (audyt przedlaunchowy): KodUrzedu w JPK_FA musi być 4-cyfrowy, inaczej
 * bramka MF odrzuca cały plik. Fallback do domyślnego US, gdy tenant nie ma
 * jeszcze ustawionego własnego kodu.
 */
describe('resolveTaxOfficeCode', () => {
  it('poprawny 4-cyfrowy kod przechodzi', () => {
    expect(resolveTaxOfficeCode('1471')).toBe('1471');
    expect(resolveTaxOfficeCode('0271')).toBe('0271');
  });

  it('trim whitespace', () => {
    expect(resolveTaxOfficeCode('  1471  ')).toBe('1471');
  });

  it('niepoprawny ⇒ domyślny (chroni walidację JPK)', () => {
    expect(resolveTaxOfficeCode(undefined)).toBe(DEFAULT_TAX_OFFICE_CODE);
    expect(resolveTaxOfficeCode(null)).toBe(DEFAULT_TAX_OFFICE_CODE);
    expect(resolveTaxOfficeCode('')).toBe(DEFAULT_TAX_OFFICE_CODE);
    expect(resolveTaxOfficeCode('14')).toBe(DEFAULT_TAX_OFFICE_CODE); // za krótki
    expect(resolveTaxOfficeCode('14080')).toBe(DEFAULT_TAX_OFFICE_CODE); // za długi
    expect(resolveTaxOfficeCode('14AB')).toBe(DEFAULT_TAX_OFFICE_CODE); // nie-cyfry
  });
});
