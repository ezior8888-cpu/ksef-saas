import { describe, expect, it } from 'vitest';

import {
  resolveAmountChangeVatRate,
  zeroVatRateFromParentLines,
} from '@/lib/invoices/correction-amount-change';

describe('korekta kwotowa — stawka bez VAT z faktury pierwotnej', () => {
  it.each([
    [[{ vatRate: 'np_ii' }, { vatRate: 'np_ii' }], 'np_ii'],
    [[{ vatRate: 'np' }], 'np'],
    [[{ vatRate: 'oo' }], 'oo'],
    [[{ vatRate: 'np_ii' }, { vatRate: '23' }], undefined],
    [[{ vatRate: '0' }], undefined],
    [[{ vatRate: '23' }], undefined],
    [[], undefined],
  ])('%j → %s', (lines, expected) => {
    expect(zeroVatRateFromParentLines(lines)).toBe(expected);
  });

  it('jawna stawka bez VAT wygrywa z „0 KR”, ale wymaga zerowego VAT', () => {
    expect(resolveAmountChangeVatRate({ netDelta: -100, vatDelta: 0, grossDelta: -100, vatRate: 'np_ii' })).toBe('np_ii');
    expect(resolveAmountChangeVatRate({ netDelta: -100, vatDelta: 0, grossDelta: -100 })).toBe('0');
    expect(() => resolveAmountChangeVatRate({ netDelta: -100, vatDelta: -23, grossDelta: -123, vatRate: 'np_ii' }))
      .toThrow('różnica VAT musi być 0');
  });
});
