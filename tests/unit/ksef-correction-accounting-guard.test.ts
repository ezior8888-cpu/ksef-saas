import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertOutgoingCorrectionsReconciled,
  CorrectionReconciliationError,
  isUnreconciledCorrectionRow,
} from '@/lib/ksef/accounting-provenance';

const params = {
  tenantId: 'tenant-a',
  environment: 'production' as const,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  endBound: 'inclusive' as const,
};

function fixture(result: { count: number | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), lt: vi.fn(), or: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.or.mockReturnValue(query);
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, query, from };
}

describe('accounting correction reconciliation guard', () => {
  it('uses an exact head count scoped to one tenant, production and the accounting period', async () => {
    const { client, query, from } = fixture({ count: 0, error: null });
    await assertOutgoingCorrectionsReconciled(client, params);

    expect(from).toHaveBeenCalledExactlyOnceWith('invoices');
    expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
    expect(query.eq).toHaveBeenCalledWith('direction', 'outgoing');
    expect(query.eq).toHaveBeenCalledWith('ksef_status', 'accepted');
    expect(query.eq).toHaveBeenCalledWith('ksef_environment', 'production');
    expect(query.gte).toHaveBeenCalledWith('issue_date', '2026-09-01');
    expect(query.lte).toHaveBeenCalledWith('issue_date', '2026-09-30');
    expect(query.or).toHaveBeenCalledWith('invoice_kind.eq.correction,invoice_type.in.(KOR,KOR_ZAL,KOR_ROZ)');
  });

  it('uses the exclusive upper bound for month and chart reads', async () => {
    const { client, query } = fixture({ count: 0, error: null });
    await assertOutgoingCorrectionsReconciled(client, {
      ...params, periodEnd: '2026-10-01', endBound: 'exclusive',
    });
    expect(query.lt).toHaveBeenCalledWith('issue_date', '2026-10-01');
    expect(query.lte).not.toHaveBeenCalled();
  });

  it.each([null, NaN, -1, 0.5])('fails closed when count is %s', async (count) => {
    const { client } = fixture({ count, error: null });
    await expect(assertOutgoingCorrectionsReconciled(client, params))
      .rejects.toThrow('Nie można sprawdzić kwot przyjętych korekt');
  });

  it('fails closed on a database error even if count is zero', async () => {
    const { client } = fixture({ count: 0, error: { message: 'DB unavailable' } });
    await expect(assertOutgoingCorrectionsReconciled(client, params))
      .rejects.toThrow('Nie można sprawdzić kwot przyjętych korekt');
  });

  it('stops a known correction and recognizes imported regular/KOR independently of invoice_kind', async () => {
    const { client } = fixture({ count: 1, error: null });
    await expect(assertOutgoingCorrectionsReconciled(client, params))
      .rejects.toBeInstanceOf(CorrectionReconciliationError);
    expect(isUnreconciledCorrectionRow({ invoice_kind: 'correction', invoice_type: 'VAT' })).toBe(true);
    expect(isUnreconciledCorrectionRow({ invoice_kind: 'regular', invoice_type: 'KOR' })).toBe(true);
    expect(isUnreconciledCorrectionRow({ invoice_kind: 'regular', invoice_type: 'VAT' })).toBe(false);
  });
});
