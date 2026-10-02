import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  invoiceCurrency: 'PLN' as string | null,
  patches: [] as Record<string, unknown>[],
  adminCalls: [] as { fn: string; args: Record<string, unknown> }[],
  adminResponse: { data: 'exp-1' as string | null, error: null as { message: string } | null },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/categorization', () => ({ learnFromCorrection: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: vi.fn() }));
vi.mock('@/lib/jobs/events', () => ({ ocrProcessPhotoRequested: { create: vi.fn() } }));
vi.mock('@/lib/jobs/error-message', () => ({ formatJobSendError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mocks.adminCalls.push({ fn, args });
      return mocks.adminResponse;
    },
  }),
}));
vi.mock('@/lib/supabase/auth-context', () => ({ requireUserAndActiveOrg: vi.fn() }));
vi.mock('@/lib/storage/expenses', () => ({ uploadExpensePhoto: vi.fn(), deleteExpensePhoto: vi.fn() }));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: async () => 'ten-1' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) => {
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
        maybeSingle: async () => {
          if (patch) return { data: { id: 'exp-1' }, error: null };
          if (table === 'invoices') return { data: { currency: mocks.invoiceCurrency }, error: null };
          return { data: mocks.existing, error: null };
        },
      });
      return q;
    },
  }),
}));

import { reviewExpenseAction } from '@/app/actions/expenses';
import { learnFromCorrection } from '@/lib/categorization';
import { deductibleAfterVatChange } from '@/lib/categorization/vat-deduction';
import { requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/server';

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
  mocks.adminCalls = [];
  mocks.adminResponse = { data: 'exp-1', error: null };
  mocks.existing = null;
  mocks.invoiceCurrency = 'PLN';
  vi.mocked(requireUserAndActiveOrg).mockImplementation(async () => ({
    supabase: await createClient(),
    user: { id: 'u-1' },
    tenantId: 'ten-1',
    role: 'member',
  }));
});

describe('ręczne zatwierdzenie walutowej faktury KSeF', () => {
  const ksefExpense = () => ({
    ...wydatek(98.75, 0),
    source: 'ksef_inbox',
    ksef_invoice_id: 'inv-1',
    is_deductible: false,
    updated_at: '2026-10-01T00:00:00Z',
    issue_date: '2026-09-25',
    ocr_extracted_data: {
      source: 'ksef_inbox',
      currency: 'EUR',
      fx: {
        currency: 'EUR', mid: 4.25, tableNo: '187/A/NBP/2026',
        effectiveDate: '2026-09-24', appliedFor: '2026-09-25',
      },
    },
  });

  it('nie pozwala jednym kliknięciem włączyć starego kosztu EUR do KPiR', async () => {
    mocks.existing = ksefExpense(); // także historyczny wiersz bez śladu FX
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', { is_deductible: true });
    expect(result).toMatchObject({ success: false });
    expect(mocks.patches).toEqual([]);
    expect(mocks.adminCalls).toEqual([]);
  });

  it('po jawnym potwierdzeniu XML i kwot pozwala zapisać decyzję klienta', async () => {
    mocks.existing = ksefExpense();
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', {
      is_deductible: true,
      confirmForeignCurrencyReview: true,
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.patches).toEqual([]);
    expect(mocks.adminCalls).toEqual([{
      fn: 'review_ksef_expense',
      args: expect.objectContaining({
        p_tenant_id: 'ten-1',
        p_expense_id: 'exp-1',
        p_actor_user_id: 'u-1',
        p_expected_updated_at: '2026-10-01T00:00:00Z',
        p_patch: expect.objectContaining({ is_deductible: true, is_reviewed: true }),
      }),
    }]);
    expect(mocks.adminCalls[0].args.p_patch).not.toHaveProperty('confirmForeignCurrencyReview');
  });

  it('brak waluty powiązanej faktury blokuje zatwierdzenie', async () => {
    mocks.existing = ksefExpense();
    mocks.invoiceCurrency = null;
    const result = await reviewExpenseAction('exp-1', {
      is_deductible: true,
      confirmForeignCurrencyReview: true,
    });
    expect(result).toMatchObject({ success: false });
    expect(mocks.patches).toEqual([]);
  });

  it('brak waluty pozwala wyłącznie wyłączyć historyczny koszt z KPiR', async () => {
    mocks.existing = { ...ksefExpense(), is_deductible: true, ocr_extracted_data: null };
    mocks.invoiceCurrency = null;
    const result = await reviewExpenseAction('exp-1', { is_deductible: false });
    expect(result).toMatchObject({ success: true });
    expect(mocks.adminCalls[0].args.p_patch).toMatchObject({ is_deductible: false, is_reviewed: false });
  });

  it('brak powiązanej faktury KSeF pozwala wyłącznie wyłączyć koszt z KPiR', async () => {
    mocks.existing = { ...ksefExpense(), ksef_invoice_id: null, is_deductible: true };
    const result = await reviewExpenseAction('exp-1', { is_deductible: false });
    expect(result).toMatchObject({ success: true });
    expect(mocks.adminCalls[0].args.p_patch).toMatchObject({ is_deductible: false, is_reviewed: false });
  });

  it('faktura PLN zachowuje dotychczasową ścieżkę bez potwierdzenia FX', async () => {
    mocks.existing = ksefExpense();
    const result = await reviewExpenseAction('exp-1', { is_deductible: true });
    expect(result).toMatchObject({ success: true });
  });

  it('bez kursu sam checkbox nie może włączyć kwot EUR do KPiR', async () => {
    mocks.existing = { ...ksefExpense(), ocr_extracted_data: null };
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', {
      is_deductible: true,
      confirmForeignCurrencyReview: true,
    });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Brak potwierdzonego kursu') });
    expect(mocks.patches).toEqual([]);
  });

  it('zmiana daty dokumentu unieważnia ślad kursu i blokuje KPiR', async () => {
    mocks.existing = ksefExpense();
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', {
      issue_date: '2026-09-26',
      is_deductible: true,
      confirmForeignCurrencyReview: true,
    });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Brak potwierdzonego kursu') });
    expect(mocks.patches).toEqual([]);
  });

  it('po zmianie daty nadal pozwala wyłączyć koszt walutowy z KPiR', async () => {
    mocks.existing = { ...ksefExpense(), is_deductible: true };
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', {
      issue_date: '2026-09-26',
      is_deductible: false,
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.adminCalls[0].args.p_patch).toMatchObject({ issue_date: '2026-09-26', is_deductible: false, is_reviewed: false });
  });

  it('historyczny koszt EUR można wyłączyć z KPiR bez potwierdzania nieznanego kursu', async () => {
    mocks.existing = { ...ksefExpense(), is_deductible: true, ocr_extracted_data: null };
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', { is_deductible: false });
    expect(result).toMatchObject({ success: true });
    expect(mocks.adminCalls[0].args.p_patch).toMatchObject({ is_deductible: false, is_reviewed: false });
  });

  it('brak pola is_deductible nie obchodzi blokady historycznego kosztu bez kursu', async () => {
    mocks.existing = { ...ksefExpense(), is_deductible: true, ocr_extracted_data: null };
    mocks.invoiceCurrency = 'EUR';
    const result = await reviewExpenseAction('exp-1', { confirmForeignCurrencyReview: true });
    expect(result).toMatchObject({ success: false });
    expect(mocks.patches).toEqual([]);
    expect(mocks.adminCalls).toEqual([]);
  });

  it('odrzuca nowe pola spoza listy przed wywołaniem service_role', async () => {
    mocks.existing = ksefExpense();
    const forged = { is_deductible: true, source: 'manual' } as Parameters<typeof reviewExpenseAction>[1];
    const result = await reviewExpenseAction('exp-1', forged);
    expect(result).toMatchObject({ success: false, error: 'Nieprawidłowe dane wydatku KSeF' });
    expect(mocks.adminCalls).toEqual([]);
  });

  it('odrzuca niepoprawne kwoty i daty przed wywołaniem service_role', async () => {
    mocks.existing = ksefExpense();
    const result = await reviewExpenseAction('exp-1', {
      is_deductible: false,
      vat_amount: Number.POSITIVE_INFINITY,
      issue_date: '2026-02-30',
    });
    expect(result).toMatchObject({ success: false });
    expect(mocks.adminCalls).toEqual([]);
  });

  it('odrzuca niespójny link do KSeF nawet przy zwykłym źródle', async () => {
    mocks.existing = { ...ksefExpense(), source: 'manual' };
    const result = await reviewExpenseAction('exp-1', { is_deductible: false });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Niespójne powiązanie') });
    expect(mocks.adminCalls).toEqual([]);
    expect(mocks.patches).toEqual([]);
  });

  it('bez nowego członkostwa lub widocznego wydatku nie uruchamia service_role', async () => {
    vi.mocked(requireUserAndActiveOrg).mockRejectedValueOnce(new Error('no active org'));
    expect(await reviewExpenseAction('exp-1', { is_deductible: false })).toMatchObject({ success: false });
    mocks.existing = null;
    expect(await reviewExpenseAction('exp-1', { is_deductible: false })).toMatchObject({ success: false });
    expect(mocks.adminCalls).toEqual([]);
  });

  it('błąd lub nieaktualna wersja wiersza nie zgłasza sukcesu', async () => {
    mocks.existing = ksefExpense();
    mocks.adminResponse = { data: null, error: { message: 'db details' } };
    expect(await reviewExpenseAction('exp-1', { is_deductible: false })).toMatchObject({
      success: false,
      error: 'Nie udało się bezpiecznie zapisać kosztu KSeF',
    });
    mocks.adminResponse = { data: null, error: null };
    expect(await reviewExpenseAction('exp-1', { is_deductible: false })).toMatchObject({
      success: false,
      error: expect.stringContaining('Wydatek zmienił się'),
    });
    expect(mocks.patches).toEqual([]);
  });
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
