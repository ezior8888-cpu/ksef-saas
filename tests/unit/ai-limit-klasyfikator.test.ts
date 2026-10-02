import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-107: klasyfikator kosztów (KPiR) wołał model bez limitu. Teraz pyta
 * o budżet AI firmy; po odmowie koszt dostaje kategorię domyślną do ręcznej
 * poprawki, a po wywołaniu zużycie trafia do budżetu.
 */

const mocks = vi.hoisted(() => ({ check: vi.fn(), record: vi.fn(), ai: vi.fn() }));
vi.mock('@/lib/ai/tenant-ai-budget', () => ({ checkTenantAiBudget: mocks.check, recordTenantAiUsage: mocks.record }));
vi.mock('@/lib/categorization/ai-classifier', () => ({ classifyByAI: mocks.ai }));
vi.mock('@/lib/categorization/heuristics', () => ({ classifyByHeuristics: () => null }));
vi.mock('@/lib/categorization/rule-engine', () => ({ classifyByKeyword: async () => null, classifyByNip: async () => null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q = { select: () => q, eq: () => q, ilike: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) };
    return { from: () => q };
  },
}));

import { categorizeExpense } from '@/lib/categorization';

const data = { seller_name: 'Nieznany Dostawca', seller_nip: null, document_number: 'X/1', gross_amount: 100 } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ai.mockImplementation(async (_d: unknown, onUsage?: (u: { inputTokens: number; outputTokens: number }) => void) => {
    onUsage?.({ inputTokens: 300, outputTokens: 40 });
    return { kpir_column: 'col_13', category_label: 'Usługi', confidence: 0.7, method: 'ai_claude' };
  });
});

describe('klasyfikator a budżet AI firmy', () => {
  it('limit wyczerpany — bez wywołania modelu, kategoria domyślna', async () => {
    mocks.check.mockResolvedValue({ allowed: false, message: 'limit' });
    const r = await categorizeExpense('t1', data);
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(r.method).toBe('manual');
  });

  it('w limicie — model i zapis zużycia', async () => {
    mocks.check.mockResolvedValue({ allowed: true });
    await categorizeExpense('t1', data);
    expect(mocks.check).toHaveBeenCalledWith('t1', 'classify');
    expect(mocks.record).toHaveBeenCalledWith('t1', { inputTokens: 300, outputTokens: 40 });
  });
});
