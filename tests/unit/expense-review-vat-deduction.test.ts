import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  patches: [] as Record<string, unknown>[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/categorization', () => ({ learnFromCorrection: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({ ocrProcessPhotoRequested: { create: vi.fn() } }));
vi.mock('@/lib/inngest/error-message', () => ({ formatInngestSendError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/auth-context', () => ({ requireUserAndActiveOrg: vi.fn() }));
vi.mock('@/lib/storage/expenses', () => ({ uploadExpensePhoto: vi.fn(), deleteExpensePhoto: vi.fn() }));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: async () => 'ten-1' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: () => {
      let patch: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p;
          mocks.patches.push(p);
          return q;
        },
        maybeSingle: async () =>
          patch ? { data: { id: 'exp-1' }, error: null } : { data: mocks.existing, error: null },
      });
      return q;
    },
  }),
}));

import { reviewExpenseAction } from '@/app/actions/expenses';
import { learnFromCorrection } from '@/lib/categorization';
import { deductibleAfterVatChange } from '@/lib/categorization/vat-deduction';

/**
 * JPK_V7M odlicza `vat_deductible_amount` (K_43), nie `vat_amount`. OCR
 * zapisuje oba przy tworzeniu wydatku; poprawka samego VAT zostawiała
 * w deklaracji odczyt OCR.
 */

const wydatek = (vat: number, deductible: number) => ({
  seller_nip: '1234567890',
  seller_name: 'Dostawca',
  kpir_column: 'col_13',
  category_label: 'Usługi',
  vat_amount: vat,
  vat_deductible_amount: deductible,
});

beforeEach(() => {
  mocks.patches = [];
  mocks.existing = null;
});

describe('odliczenie VAT po ręcznej poprawce wydatku', () => {
  it('OCR odczytał 460 zł, klient poprawił na 46 zł → JPK odliczy 46 zł', async () => {
    mocks.existing = wydatek(460, 460);
    await expect(
      reviewExpenseAction('exp-1', { net_amount: 200, vat_amount: 46, gross_amount: 246 }),
    ).resolves.toEqual({ success: true });
    expect(mocks.patches[0]).toMatchObject({ vat_amount: 46, vat_deductible_amount: 46 });
  });

  it('VAT bez zmian (formularz wysyła go zawsze) — odliczenia nie ruszamy', async () => {
    mocks.existing = wydatek(46, 23);
    await reviewExpenseAction('exp-1', { vat_amount: 46, notes: 'ok' });
    expect(mocks.patches[0]).not.toHaveProperty('vat_deductible_amount');
  });

  it('zerowe odliczenie (firma zwolniona z VAT) zostaje zerowe po poprawce', async () => {
    mocks.existing = wydatek(23, 0);
    await reviewExpenseAction('exp-1', { vat_amount: 46 });
    expect(mocks.patches[0]).toMatchObject({ vat_amount: 46, vat_deductible_amount: 0 });
  });
});

describe('błąd uczenia kategorii', () => {
  it('nie zapisuje treści wyjątku z danych użytkownika w logu i zachowuje zapis wydatku', async () => {
    mocks.existing = wydatek(46, 46);
    const forgedLine = '\n[ERROR] forged log entry: prywatne dane';
    vi.mocked(learnFromCorrection).mockRejectedValueOnce(new Error(forgedLine));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        reviewExpenseAction('exp-1', { category_label: 'Nowa kategoria' }),
      ).resolves.toEqual({ success: true });
      expect(learnFromCorrection).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledWith('[expenses] learnFromCorrection failed');
      const loggedText = errorLog.mock.calls.flat().map(String).join('\n');
      expect(loggedText).not.toContain(forgedLine);
      expect(loggedText).not.toContain('prywatne dane');
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe('deductibleAfterVatChange', () => {
  it.each([
    ['pełne zostaje pełne', { vat: 460, deductible: 460 }, 46, 46],
    ['zerowe zostaje zerowe', { vat: 23, deductible: 0 }, 46, 0],
    ['częściowe w tej samej części (50%)', { vat: 46, deductible: 23 }, 92, 46],
    ['bez VAT wcześniej — pełne', { vat: 0, deductible: 0 }, 23, 23],
    ['grosze zaokrąglone', { vat: 100, deductible: 50 }, 33.33, 16.67],
  ])('%s', (_opis, before, newVat, expected) => {
    expect(deductibleAfterVatChange(before, newVat)).toBe(expected);
  });
});
