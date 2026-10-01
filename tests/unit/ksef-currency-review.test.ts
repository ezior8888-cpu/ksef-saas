import { describe, expect, it, vi } from 'vitest';

import {
  assertKsefExpensesReadyForPln,
  type KsefExpenseForPlnReport,
} from '@/lib/expenses/ksef-currency-review';

const expense = (changes: Partial<KsefExpenseForPlnReport> = {}): KsefExpenseForPlnReport => ({
  source: 'ksef_inbox',
  ksef_invoice_id: 'inv-1',
  issue_date: '2026-09-25',
  is_reviewed: true,
  ocr_extracted_data: {
    source: 'ksef_inbox',
    currency: 'EUR',
    fx: {
      currency: 'EUR',
      mid: 4.25,
      tableNo: '187/A/NBP/2026',
      effectiveDate: '2026-09-24',
      appliedFor: '2026-09-25',
    },
  },
  ...changes,
});

describe('bramka waluty kosztów KSeF w raportach PLN', () => {
  it('nie odpytuje faktur przy zwykłych wydatkach', async () => {
    const lookup = vi.fn();
    await assertKsefExpensesReadyForPln([expense({
      source: 'ocr_photo', ksef_invoice_id: null, ocr_extracted_data: null,
    })], lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('akceptuje PLN bez śladu FX i ręcznie przejrzany EUR z kursem', async () => {
    const lookup = vi.fn(async () => new Map<string, string | null>([
      ['inv-1', 'EUR'], ['inv-2', 'PLN'],
    ]));
    await expect(assertKsefExpensesReadyForPln([
      expense(),
      expense({
        ksef_invoice_id: 'inv-2',
        is_reviewed: false,
        ocr_extracted_data: null,
      }),
    ], lookup)).resolves.toBeUndefined();
  });

  it('blokuje historyczny EUR włączony bez kursu, także gdy miał is_reviewed=true', async () => {
    const lookup = vi.fn(async () => new Map([['inv-1', 'EUR']]));
    await expect(assertKsefExpensesReadyForPln([
      expense({ ocr_extracted_data: null }),
    ], lookup)).rejects.toThrow('Raport wstrzymany');
  });

  it('blokuje EUR z kursem bez przeglądu i po zmianie daty', async () => {
    const lookup = vi.fn(async () => new Map([['inv-1', 'EUR']]));
    await expect(assertKsefExpensesReadyForPln([
      expense({ is_reviewed: false }),
    ], lookup)).rejects.toThrow('Raport wstrzymany');
    await expect(assertKsefExpensesReadyForPln([
      expense({ issue_date: '2026-09-26' }),
    ], lookup)).rejects.toThrow('Raport wstrzymany');
  });

  it('blokuje brak powiązanej faktury i brak waluty', async () => {
    const lookup = vi.fn(async () => new Map<string, string | null>());
    await expect(assertKsefExpensesReadyForPln([
      expense({ ksef_invoice_id: null }),
    ], lookup)).rejects.toThrow('Raport wstrzymany');
    expect(lookup).not.toHaveBeenCalled();
    await expect(assertKsefExpensesReadyForPln([expense()], lookup)).rejects.toThrow('Raport wstrzymany');
  });
});
