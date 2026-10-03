import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * pg-boss ponawia job OCR OD POCZĄTKU (bez pamięci kroków). Do 01.10.2026
 * błąd po zapisie wydatku — oznaczenie zadania, karta agenta, powiadomienie —
 * kończył się drugim (i trzecim) wydatkiem z tego samego paragonu, czyli
 * podwójnym kosztem w KPiR.
 */

type Row = Record<string, unknown>;

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OCR_JOB = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

const state = vi.hoisted(() => ({
  expenses: [] as Record<string, unknown>[],
  jobUpdates: [] as Record<string, unknown>[],
  lookupError: false,
  proposal: vi.fn(),
  failedCard: vi.fn(() => ({})),
  push: vi.fn(),
  // B4: indeks UNIQUE (tenant_id, ocr_job_id) — insert dubla dostaje 23505.
  uniqueIndex: false,
  // Konkurencyjny przebieg zapisuje wydatek między odczytem a insertem.
  raceRow: null as Record<string, unknown> | null,
  insertError: null as { code: string; message: string } | null,
  rereadError: false,
  ocrFails: false,
  expenseReads: 0,
  inserts: 0,
}));

// AUD-107: budżet AI firmy — tu zawsze w limicie (osobne testy: ai-limit-*).
vi.mock('@/lib/ai/tenant-ai-budget', () => ({
  checkTenantAiBudget: async () => ({ allowed: true }),
  recordTenantAiUsage: async () => undefined,
}));
vi.mock('@/lib/categorization', () => ({
  categorizeExpense: async () => ({ kpir_column: 'col_13', category_label: 'Paliwo', method: 'rule', confidence: 0.9 }),
}));
vi.mock('@/lib/ocr/engine', () => ({
  extractInvoiceFromImage: async () => state.ocrFails ? {
    success: false, error: 'Limit AI firmy na ten miesiąc wyczerpany', inputTokens: 0, outputTokens: 0, processingTimeMs: 1,
  } : ({
    success: true,
    data: {
      seller_name: 'Stacja Paliw', seller_nip: '5260001246', seller_address: null,
      document_number: 'PAR/1', document_type: 'receipt', issue_date: '2026-09-28',
      net_amount: 100, vat_amount: 23, gross_amount: 123, vat_rate: '23',
      line_items: null, ocr_confidence: 0.95, notes: null, currency: 'PLN',
    },
    inputTokens: 1, outputTokens: 1, processingTimeMs: 1,
  }),
}));
vi.mock('@/lib/storage/expenses', () => ({
  downloadExpensePhoto: async () => ({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' }),
}));
vi.mock('@/lib/push/sender', () => ({ sendPushToUser: state.push }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: state.proposal }));
vi.mock('@/lib/flo/functions/expense-review', () => ({
  buildExpenseReviewProposal: (input: { expenseId: string }) => ({ expenseId: input.expenseId }),
  buildOcrFailedProposal: state.failedCard,
  readSellerHistory: async () => null,
}));
vi.mock('@/lib/jobs/runners/tenant-boundary', () => ({ requireTenantMember: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let insertRow: Row | null = null;
      const q: Record<string, unknown> = {};
      const matching = () => state.expenses.filter((r) => filters.every(([k, v]) => r[k] === v));
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        limit: () => q,
        update: (v: Row) => { if (table === 'ocr_jobs') state.jobUpdates.push(v); return q; },
        insert: (r: Row) => { insertRow = r; return q; },
        single: async () => {
          if (table === 'ocr_jobs') {
            return {
              data: { id: OCR_JOB, tenant_id: TENANT, created_by: USER, source_file_path: 'r2/x.jpg', source_file_mime: 'image/jpeg' },
              error: null,
            };
          }
          if (table === 'expenses' && insertRow) {
            state.inserts += 1;
            if (state.insertError) return { data: null, error: state.insertError };
            const row: Row = { id: `exp-${state.expenses.length + 1}`, ...insertRow };
            if (state.uniqueIndex && state.expenses.some(
              (e) => e.tenant_id === row.tenant_id && e.ocr_job_id === row.ocr_job_id,
            )) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_expenses_tenant_ocr_job"' },
              };
            }
            state.expenses.push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'tenants') return { data: { vat_exemption_basis: null }, error: null };
          if (table === 'expenses') {
            state.expenseReads += 1;
            if (state.lookupError) return { data: null, error: { message: 'database unavailable' } };
            if (state.rereadError && state.expenseReads > 1) {
              return { data: null, error: { message: 'database unavailable' } };
            }
            const found = matching()[0] ?? null;
            if (state.raceRow) {
              state.expenses.push(state.raceRow);
              state.raceRow = null;
            }
            return { data: found, error: null };
          }
          return { data: null, error: null };
        },
        then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      });
      return q;
    },
  }),
}));

import { onProcessOcrExhausted, runProcessOcr } from '@/lib/jobs/runners/process-ocr';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const event = { ocrJobId: OCR_JOB, tenantId: TENANT };

beforeEach(() => {
  state.expenses = [];
  state.jobUpdates = [];
  state.lookupError = false;
  state.uniqueIndex = false;
  state.raceRow = null;
  state.insertError = null;
  state.rereadError = false;
  state.ocrFails = false;
  state.expenseReads = 0;
  state.inserts = 0;
  state.proposal.mockReset().mockResolvedValue({ status: 'created' });
  state.failedCard.mockClear();
  state.push.mockReset();
});

describe('OCR — ponowienie joba nie dubluje wydatku', () => {
  it('błąd po zapisie, ponowienie — w KPiR dalej jeden wydatek', async () => {
    state.proposal.mockRejectedValueOnce(new Error('chwilowy błąd bazy'));
    await expect(runProcessOcr(event, ctx)).rejects.toThrow('chwilowy błąd bazy');
    expect(state.expenses).toHaveLength(1);

    expect(await runProcessOcr(event, ctx)).toEqual({ success: true, expenseId: 'exp-1' });
    expect(state.expenses).toHaveLength(1);
  });

  it.each([
    ['innego zadania OCR', { tenant_id: TENANT, ocr_job_id: '99999999-9999-4999-8999-999999999999' }],
    ['innej firmy', { tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ocr_job_id: OCR_JOB }],
  ])('wydatek %s nie zatrzymuje zapisu', async (_label, other) => {
    state.expenses.push({ id: 'exp-inne', ...other });
    expect(await runProcessOcr(event, ctx)).toMatchObject({ success: true });
    expect(state.expenses.filter((e) => e.ocr_job_id === OCR_JOB && e.tenant_id === TENANT)).toHaveLength(1);
  });

  it('krok po zapisie padł na stałe — zadanie wskazuje zapisany wydatek, nie „nieudane”', async () => {
    state.proposal.mockRejectedValue(new Error('karta agenta niedostępna'));
    await expect(runProcessOcr(event, ctx)).rejects.toThrow();
    state.jobUpdates = [];

    await onProcessOcrExhausted(new Error('karta agenta niedostępna'), event);
    expect(state.jobUpdates).toEqual([expect.objectContaining({ status: 'completed', expense_id: 'exp-1' })]);
    expect(state.expenses).toHaveLength(1);
  });

  it.each([
    ['innego zadania', { tenant_id: TENANT, ocr_job_id: '99999999-9999-4999-8999-999999999999' }],
    ['innej firmy', { tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ocr_job_id: OCR_JOB }],
  ])('wydatek nie powstał (jest tylko wydatek %s) — po wyczerpaniu prób „nieudane”, jak dotąd', async (_label, other) => {
    state.expenses.push({ id: 'exp-inne', ...other });
    await onProcessOcrExhausted(new Error('OCR niedostępny'), event);
    expect(state.jobUpdates).toEqual([expect.objectContaining({ status: 'failed', error_message: 'OCR niedostępny' })]);
  });

  it('nie da się sprawdzić, czy wydatek już jest — job rzuca zamiast zapisywać w ciemno', async () => {
    state.lookupError = true;
    await expect(runProcessOcr(event, ctx)).rejects.toThrow('Nie można sprawdzić, czy wydatek już istnieje');
    expect(state.expenses).toHaveLength(0);
  });
});

describe('B4 — indeks UNIQUE (tenant_id, ocr_job_id): wyścig dwóch przebiegów', () => {
  const RACE = { id: 'exp-konkurent', tenant_id: TENANT, ocr_job_id: OCR_JOB };

  it.each(['exp-konkurent', 'exp-zwyciezca-2'])(
    'przegrany wyścig (23505) — job kończy się wydatkiem zwycięzcy %s, bez dubla i bez ponowienia',
    async (winnerId) => {
      state.uniqueIndex = true;
      state.raceRow = { ...RACE, id: winnerId };

      expect(await runProcessOcr(event, ctx)).toEqual({ success: true, expenseId: winnerId });
      expect(state.expenses.filter((e) => e.ocr_job_id === OCR_JOB && e.tenant_id === TENANT)).toHaveLength(1);
      expect(state.inserts).toBe(1);
      expect(state.expenseReads).toBe(2);
      expect(state.jobUpdates).toContainEqual(expect.objectContaining({ status: 'completed', expense_id: winnerId }));
      expect(state.proposal).toHaveBeenCalledWith({ expenseId: winnerId });
    },
  );

  it.each([
    ['innego ograniczenia (brak wydatku)', []],
    ['wydatek innej firmy', [{ id: 'exp-obcy', tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ocr_job_id: OCR_JOB }]],
    ['wydatek innego zadania', [{ id: 'exp-obcy', tenant_id: TENANT, ocr_job_id: '99999999-9999-4999-8999-999999999999' }]],
  ])('23505, a ponowny odczyt nie znajduje wydatku tego zadania (%s) — błąd, nie cudze id', async (_label, rows) => {
    state.expenses.push(...rows);
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "inny"' };

    await expect(runProcessOcr(event, ctx)).rejects.toThrow('Konflikt UNIQUE nie dotyczy wydatku z tego zadania OCR');
    expect(state.expenseReads).toBe(2);
    expect(state.jobUpdates).not.toContainEqual(expect.objectContaining({ status: 'completed' }));
  });

  it('23505, a ponowny odczyt pada — błąd ponawialny, bez „zakończone”', async () => {
    state.uniqueIndex = true;
    state.raceRow = { ...RACE };
    state.rereadError = true;

    const err = await runProcessOcr(event, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('Nie można sprawdzić, czy wydatek już istnieje');
    expect((err as Error).name).not.toBe('NonRetriableError');
    expect(state.jobUpdates).not.toContainEqual(expect.objectContaining({ status: 'completed' }));
  });

  it('inny błąd zapisu — bez ponownego odczytu, komunikat bazy', async () => {
    state.insertError = { code: '23502', message: 'null value in column "seller_name"' };

    await expect(runProcessOcr(event, ctx)).rejects.toThrow('null value in column "seller_name"');
    expect(state.expenseReads).toBe(1);
  });

  it('z indeksem: ponowienie po błędzie karty nie próbuje drugiego zapisu', async () => {
    state.uniqueIndex = true;
    state.proposal.mockRejectedValueOnce(new Error('chwilowy błąd bazy'));
    await expect(runProcessOcr(event, ctx)).rejects.toThrow('chwilowy błąd bazy');

    expect(await runProcessOcr(event, ctx)).toEqual({ success: true, expenseId: 'exp-1' });
    expect(state.inserts).toBe(1);
    expect(state.expenses).toHaveLength(1);
  });
});

describe('B4 — ponowienie po zapisie, a OCR tym razem zawodzi', () => {
  it('wydatek już jest — zadanie „zakończone” z tym wydatkiem, bez „nie rozpoznano” i bez karty „wpisz ręcznie”', async () => {
    state.proposal.mockRejectedValueOnce(new Error('chwilowy błąd bazy'));
    await expect(runProcessOcr(event, ctx)).rejects.toThrow('chwilowy błąd bazy');
    state.jobUpdates = [];
    state.push.mockReset();
    state.ocrFails = true;

    expect(await runProcessOcr(event, ctx)).toEqual({ success: true, expenseId: 'exp-1' });
    expect(state.jobUpdates.at(-1)).toEqual(expect.objectContaining({ status: 'completed', expense_id: 'exp-1' }));
    expect(state.jobUpdates).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
    expect(state.failedCard).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    expect(state.expenses).toHaveLength(1);
  });

  it('wydatku nie ma — „nie rozpoznano” jak dotąd (karta i powiadomienie)', async () => {
    state.ocrFails = true;

    expect(await runProcessOcr(event, ctx)).toEqual({ success: false });
    expect(state.jobUpdates).toContainEqual(expect.objectContaining({ status: 'failed' }));
    expect(state.failedCard).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(USER, 'invoice_rejected', expect.anything());
  });

  it.each([
    ['innej firmy', { id: 'exp-obcy', tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ocr_job_id: OCR_JOB }],
    ['innego zadania', { id: 'exp-obcy', tenant_id: TENANT, ocr_job_id: '99999999-9999-4999-8999-999999999999' }],
  ])('jest tylko wydatek %s — „nie rozpoznano”', async (_label, other) => {
    state.expenses.push(other);
    state.ocrFails = true;

    expect(await runProcessOcr(event, ctx)).toEqual({ success: false });
    expect(state.jobUpdates).toContainEqual(expect.objectContaining({ status: 'failed' }));
  });

  it('nie da się sprawdzić, czy wydatek jest — job rzuca zamiast ogłaszać porażkę w ciemno', async () => {
    state.ocrFails = true;
    state.lookupError = true;

    await expect(runProcessOcr(event, ctx)).rejects.toThrow('Nie można sprawdzić, czy wydatek już istnieje');
    expect(state.jobUpdates).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
    expect(state.push).not.toHaveBeenCalled();
  });
});
