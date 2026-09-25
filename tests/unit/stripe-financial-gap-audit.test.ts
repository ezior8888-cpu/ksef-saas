import { describe, expect, it, vi } from 'vitest';

import {
  AuditFailure, assertStripeKeyMode, auditStripeFinancialGaps, parseAuditWindow,
  type AuditSources, type CaseRow, type DatabasePage, type ReceiptRow,
} from '@/lib/stripe/financial-gap-audit';

const now = new Date('2026-09-26T01:00:00.000Z');
const window = parseAuditWindow(
  ['--mode', 'test', '--from', '2026-09-23', '--to', '2026-09-25'], now,
);
const created = Date.parse('2026-09-24T12:00:00.000Z') / 1000;
const refundA = 're_12345678';
const refundB = 're_87654321';
const dispute = 'du_12345678';
const receiptA = 'evt_12345678';
const receiptB = 'evt_87654321';

function emptySources(): AuditSources {
  return {
    probeSchema: vi.fn().mockResolvedValue(undefined),
    listStripe: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
    listCases: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    listReceipts: vi.fn().mockResolvedValue({ data: [], count: 0 }),
  };
}

describe('bounded Stripe financial gap audit', () => {
  it('requires an explicit valid completed UTC window and matching key mode', () => {
    expect(() => parseAuditWindow([], now)).toThrowError(AuditFailure);
    expect(() => parseAuditWindow([
      '--mode', 'live', '--from', '2026-09-24', '--to', '2026-09-27',
    ], now)).toThrowError('invalid_input');
    expect(() => parseAuditWindow([
      '--mode', 'test', '--from', '2026-02-30', '--to', '2026-03-02',
    ], now)).toThrowError('invalid_input');
    expect(() => parseAuditWindow([
      '--mode', 'test', '--from', '2026-08-01', '--to', '2026-09-25',
    ], now)).toThrowError('invalid_input');
    expect(() => parseAuditWindow([
      '--mode', 'test', '--from', '2026-09-23', '--from', '2026-09-25',
    ], now)).toThrowError('invalid_input');
    expect(() => assertStripeKeyMode('sk_live_123456789', 'test'))
      .toThrowError('invalid_input');
    expect(() => assertStripeKeyMode('rk_test_123456789', 'test'))
      .not.toThrow();
  });

  it('probes 00080 before Stripe and fails closed when the schema is absent', async () => {
    const sources = emptySources();
    vi.mocked(sources.probeSchema).mockRejectedValue(new AuditFailure('schema_unavailable'));
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'schema_unavailable' });
    expect(sources.listStripe).not.toHaveBeenCalled();
  });

  it('follows Stripe cursors, paginates batched database matches, and reports gaps', async () => {
    const sources = emptySources();
    vi.mocked(sources.listStripe).mockImplementation(async (kind, request) => {
      if (kind === 'dispute') return { data: [{ id: dispute, created }], hasMore: false };
      if (!request.startingAfter) return { data: [{ id: refundA, created }], hasMore: true };
      expect(request.startingAfter).toBe(refundA);
      return { data: [{ id: refundB, created }], hasMore: false };
    });
    vi.mocked(sources.listCases).mockImplementation(async (_ids, offset) => {
      const all: CaseRow[] = [
        { stripe_object_id: refundA, kind: 'refund' },
        { stripe_object_id: dispute, kind: 'dispute' },
      ];
      // Deliberately simulate a server row cap of one despite limit=100.
      return { data: all.slice(offset, offset + 1), count: 2 };
    });
    const report = await auditStripeFinancialGaps(window, sources, now);
    expect(report.stripeCounts).toEqual({ refunds: 2, disputes: 1 });
    expect(report.missingRefundIds).toEqual([refundB]);
    expect(report.missingDisputeIds).toEqual([]);
    expect(report.status).toBe('attention');
    expect(sources.listCases).toHaveBeenCalledTimes(2);
    expect(sources.listCases).toHaveBeenNthCalledWith(
      2, [refundA, refundB, dispute], 1, 100,
    );
  });

  it('reports failed and stale receipts even when every Stripe object has a case', async () => {
    const sources = emptySources();
    vi.mocked(sources.listStripe).mockImplementation(async (kind) =>
      kind === 'refund'
        ? { data: [{ id: refundA, created }], hasMore: false }
        : { data: [], hasMore: false });
    vi.mocked(sources.listCases).mockResolvedValue({
      data: [{ stripe_object_id: refundA, kind: 'refund' }], count: 1,
    });
    vi.mocked(sources.listReceipts).mockImplementation(async (group): Promise<DatabasePage<ReceiptRow>> => {
      if (group === 'failed') {
        return { data: [{
          id: receiptA, type: 'refund.updated',
          processing_status: 'failed', received_at: '2026-09-25T23:59:00Z',
        }], count: 1 };
      }
      return { data: [{
        id: receiptB, type: 'charge.dispute.created',
        processing_status: 'processing', received_at: '2026-09-25T00:00:00Z',
      }], count: 1 };
    });
    const report = await auditStripeFinancialGaps(window, sources, now);
    expect(report.missingRefundIds).toEqual([]);
    expect(report.uncertainReceipts).toEqual([
      { id: receiptA, type: 'refund.updated', status: 'failed' },
      { id: receiptB, type: 'charge.dispute.created', status: 'processing' },
    ]);
    expect(JSON.stringify(report)).not.toContain('payload');
    expect(report.status).toBe('attention');
  });

  it('never treats an incomplete database page as zero missing objects', async () => {
    const sources = emptySources();
    vi.mocked(sources.listStripe).mockImplementation(async (kind) =>
      kind === 'refund'
        ? { data: [{ id: refundA, created }, { id: refundB, created }], hasMore: false }
        : { data: [], hasMore: false });
    vi.mocked(sources.listCases).mockImplementation(async (_ids, offset) =>
      offset === 0
        ? { data: [{ stripe_object_id: refundA, kind: 'refund' }], count: 2 }
        : { data: [], count: 2 });
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'source_inconsistent' });
  });

  it('rejects a truncated Stripe sequence and hides provider exception text', async () => {
    const sources = emptySources();
    vi.mocked(sources.listStripe).mockResolvedValue({ data: [], hasMore: true });
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'source_inconsistent' });
    vi.mocked(sources.listStripe).mockRejectedValue(new Error('sk_test_PRIVATE_TOKEN'));
    try {
      await auditStripeFinancialGaps(window, sources, now);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'stripe_unavailable' });
      expect(String(error)).not.toContain('PRIVATE_TOKEN');
    }
  });

  it('fails closed at the Stripe page cap instead of returning a partial clean result', async () => {
    const sources = emptySources();
    let pageNumber = 0;
    vi.mocked(sources.listStripe).mockImplementation(async () => {
      const data = Array.from({ length: 100 }, (_, index) => ({
        id: 're_' + String(pageNumber * 100 + index).padStart(8, '0'),
        created,
      }));
      pageNumber++;
      return { data, hasMore: true };
    });
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'limit_exceeded' });
    expect(pageNumber).toBe(50);
    expect(sources.listCases).not.toHaveBeenCalled();
  });
  it('rejects mismatched local kind and stale receipt timestamp', async () => {
    const sources = emptySources();
    vi.mocked(sources.listStripe).mockImplementation(async (kind) =>
      kind === 'refund'
        ? { data: [{ id: refundA, created }], hasMore: false }
        : { data: [], hasMore: false });
    vi.mocked(sources.listCases).mockResolvedValue({
      data: [{ stripe_object_id: refundA, kind: 'dispute' }], count: 1,
    });
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'source_inconsistent' });
    vi.mocked(sources.listCases).mockResolvedValue({
      data: [{ stripe_object_id: refundA, kind: 'refund' }], count: 1,
    });
    vi.mocked(sources.listReceipts).mockImplementation(async (group) =>
      group === 'failed'
        ? { data: [], count: 0 }
        : { data: [{
          id: receiptA, type: 'refund.updated',
          processing_status: 'processing', received_at: '2026-09-26T00:59:00Z',
        }], count: 1 });
    await expect(auditStripeFinancialGaps(window, sources, now))
      .rejects.toMatchObject({ code: 'source_inconsistent' });
  });
});
