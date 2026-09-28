import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/cash-method', () => ({ updateCashMethodAction: vi.fn() }));

import { CashMethodForm } from '@/components/settings/cash-method-form';
import { readTenantCashMethod } from '@/lib/invoices/cash-method';

/**
 * Metoda kasowa VAT firmy (00094). Na fakturach: P_16 = 1 i wyrazy „metoda
 * kasowa” (art. 106e ust. 1 pkt 16) — podpięcie do faktur w osobnym kroku.
 */

const klient = (result: { data?: unknown; error?: { code?: string; message: string } | null }) =>
  ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) }),
    }),
  }) as unknown as Parameters<typeof readTenantCashMethod>[0];

describe('readTenantCashMethod', () => {
  it('przed migracją 00094 (42703) → metoda memoriałowa, strona działa', async () => {
    await expect(readTenantCashMethod(klient({ error: { code: '42703', message: 'no column' } }), 't')).resolves.toBe(false);
  });

  it('inny błąd bazy rzuca — błąd to nie „memoriałowa”', async () => {
    await expect(readTenantCashMethod(klient({ error: { code: '57014', message: 'timeout' } }), 't')).rejects.toThrow(/timeout/);
  });

  it.each([
    [{ vat_cash_method: true }, true],
    [{ vat_cash_method: false }, false],
    [null, false],
    [{ vat_cash_method: 'true' }, false], // tylko prawdziwy boolean
  ])('%j → %s', async (data, expected) => {
    await expect(readTenantCashMethod(klient({ data }), 't')).resolves.toBe(expected);
  });
});

describe('formularz metody kasowej', () => {
  it('pole zaznaczone, gdy firma ma metodę kasową', () => {
    const html = renderToStaticMarkup(<CashMethodForm initialEnabled canEdit />);
    expect(html).toContain('Rozliczam VAT metodą kasową');
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  it('bez uprawnień — pole zablokowane, bez przycisku zapisu', () => {
    const html = renderToStaticMarkup(<CashMethodForm initialEnabled={false} canEdit={false} />);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).not.toContain('Zapisz metodę rozliczania');
  });
});
