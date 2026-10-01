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
}));

vi.mock('@/lib/categorization', () => ({
  categorizeExpense: async () => ({ kpir_column: 'col_13', category_label: 'Paliwo', method: 'rule', confidence: 0.9 }),
}));
vi.mock('@/lib/ocr/engine', () => ({
  extractInvoiceFromImage: async () => ({
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
vi.mock('@/lib/push/sender', () => ({ sendPushToUser: vi.fn() }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: state.proposal }));
vi.mock('@/lib/flo/functions/expense-review', () => ({
  buildExpenseReviewProposal: () => ({}), buildOcrFailedProposal: () => ({}), readSellerHistory: async () => null,
}));
vi.mock('@/lib/inngest/jobs/tenant-boundary', () => ({ requireTenantMember: vi.fn(async () => undefined) }));
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
            const row = { id: `exp-${state.expenses.length + 1}`, ...insertRow };
            state.expenses.push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'tenants') return { data: { vat_exemption_basis: null }, error: null };
          if (table === 'expenses') {
            if (state.lookupError) return { data: null, error: { message: 'database unavailable' } };
            return { data: matching()[0] ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      });
      return q;
    },
  }),
}));

import { onProcessOcrExhausted, runProcessOcr } from '@/lib/inngest/jobs/process-ocr';

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
  state.proposal.mockReset().mockResolvedValue({ status: 'created' });
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
