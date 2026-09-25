/** Bounded, read-only comparison of Stripe financial objects with local cases. */
export const FINANCIAL_EVENT_TYPES = [
  'refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
] as const;

const DAY_MS = 86_400_000;
const PAGE_SIZE = 100;
const MAX_STRIPE_PAGES = 50;
const MAX_DB_PAGES = 500;
const MAX_RECEIPTS = 5000;
const STALE_MS = 15 * 60_000;
const REFUND_ID = /^re_[A-Za-z0-9]{8,}$/;
const DISPUTE_ID = /^du_[A-Za-z0-9]{8,}$/;
const EVENT_ID = /^evt_[A-Za-z0-9]{8,}$/;

export type AuditMode = 'test' | 'live';
export type FinancialKind = 'refund' | 'dispute';
export type AuditFailureCode =
  | 'invalid_input' | 'schema_unavailable' | 'database_unavailable'
  | 'stripe_unavailable' | 'limit_exceeded' | 'source_inconsistent';

export class AuditFailure extends Error {
  constructor(readonly code: AuditFailureCode) {
    super(code);
    this.name = 'AuditFailure';
  }
}

export interface AuditWindow {
  mode: AuditMode;
  from: string;
  to: string;
  fromEpoch: number;
  toEpoch: number;
}
export interface StripeItem { id: string; created: number }
export interface Page<T> { data: T[]; hasMore: boolean }
export interface DatabasePage<T> { data: T[]; count: number }
export interface CaseRow { stripe_object_id: string; kind: FinancialKind }
export interface ReceiptRow {
  id: string;
  type: string;
  processing_status: string;
  received_at: string;
}
export interface AuditSources {
  probeSchema(): Promise<void>;
  listStripe(
    kind: FinancialKind,
    request: { fromEpoch: number; toEpoch: number; limit: number; startingAfter?: string },
  ): Promise<Page<StripeItem>>;
  listCases(ids: string[], offset: number, limit: number): Promise<DatabasePage<CaseRow>>;
  listReceipts(
    group: 'failed' | 'stale', cutoffIso: string, offset: number, limit: number,
  ): Promise<DatabasePage<ReceiptRow>>;
}
export interface FinancialGapReport {
  status: 'attention' | 'no_gaps_detected';
  mode: AuditMode;
  window: { from: string; to: string; timezone: 'UTC'; upperBound: 'exclusive' };
  observedAt: string;
  scope: 'supplied_stripe_key_and_database_in_window';
  databaseEnvironmentVerified: false;
  receiptScope: 'all_financial_failed_or_stale_not_window_limited';
  stripeCounts: { refunds: number; disputes: number };
  missingRefundIds: string[];
  missingDisputeIds: string[];
  uncertainReceipts: Array<{ id: string; type: string; status: string }>;
}

function utcDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AuditFailure('invalid_input');
  const epoch = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new AuditFailure('invalid_input');
  }
  return epoch;
}

/** Require an explicit interval of complete UTC days; never silently scan all time. */
export function parseAuditWindow(args: string[], now = new Date()): AuditWindow {
  if (args.length !== 6) throw new AuditFailure('invalid_input');
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !['--mode', '--from', '--to'].includes(key) || !value || values.has(key)) {
      throw new AuditFailure('invalid_input');
    }
    values.set(key, value);
  }
  const mode = values.get('--mode');
  const from = values.get('--from');
  const to = values.get('--to');
  if ((mode !== 'test' && mode !== 'live') || !from || !to) {
    throw new AuditFailure('invalid_input');
  }
  const fromMs = utcDay(from);
  const toMs = utcDay(to);
  if (fromMs >= toMs || toMs - fromMs > 31 * DAY_MS || toMs > now.getTime()) {
    throw new AuditFailure('invalid_input');
  }
  return { mode, from, to, fromEpoch: fromMs / 1000, toEpoch: toMs / 1000 };
}

export function assertStripeKeyMode(key: string | undefined, mode: AuditMode): void {
  if (!key || !new RegExp('^(sk|rk)_' + mode + '_[A-Za-z0-9]+$').test(key)) {
    throw new AuditFailure('invalid_input');
  }
}

async function callSource<T>(code: AuditFailureCode, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AuditFailure) throw error;
    // A provider exception can contain request details; never echo it.
    throw new AuditFailure(code);
  }
}

async function collectStripe(
  kind: FinancialKind, window: AuditWindow, sources: AuditSources,
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  const pattern = kind === 'refund' ? REFUND_ID : DISPUTE_ID;
  for (let pageNumber = 0; pageNumber < MAX_STRIPE_PAGES; pageNumber++) {
    const page = await callSource('stripe_unavailable', () => sources.listStripe(kind, {
      fromEpoch: window.fromEpoch, toEpoch: window.toEpoch, limit: PAGE_SIZE,
      ...(startingAfter ? { startingAfter } : {}),
    }));
    if (!page || !Array.isArray(page.data) || typeof page.hasMore !== 'boolean' ||
        page.data.length > PAGE_SIZE || (page.hasMore && page.data.length === 0)) {
      throw new AuditFailure('source_inconsistent');
    }
    for (const item of page.data) {
      if (!item || typeof item.id !== 'string' || !pattern.test(item.id) ||
          seen.has(item.id) || !Number.isSafeInteger(item.created) ||
          item.created < window.fromEpoch || item.created >= window.toEpoch) {
        throw new AuditFailure('source_inconsistent');
      }
      ids.push(item.id);
      seen.add(item.id);
    }
    if (!page.hasMore) return ids;
    if (ids.length >= PAGE_SIZE * MAX_STRIPE_PAGES) throw new AuditFailure('limit_exceeded');
    startingAfter = page.data[page.data.length - 1]!.id;
  }
  throw new AuditFailure('limit_exceeded');
}

async function collectCases(
  ids: string[], sources: AuditSources, budget: { used: number },
): Promise<Map<string, FinancialKind>> {
  const result = new Map<string, FinancialKind>();
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const batch = ids.slice(start, start + PAGE_SIZE);
    const allowed = new Set(batch);
    let offset = 0;
    let count: number | null = null;
    do {
      if (++budget.used > MAX_DB_PAGES) throw new AuditFailure('limit_exceeded');
      const page = await callSource('database_unavailable', () =>
        sources.listCases(batch, offset, PAGE_SIZE));
      if (!page || !Array.isArray(page.data) || !Number.isSafeInteger(page.count) ||
          page.count < 0 || page.count > batch.length || page.data.length > PAGE_SIZE ||
          (count !== null && page.count !== count) ||
          (offset < page.count && page.data.length === 0)) {
        throw new AuditFailure('source_inconsistent');
      }
      count = page.count;
      for (const row of page.data) {
        if (!row || !allowed.has(row.stripe_object_id) ||
            (row.kind !== 'refund' && row.kind !== 'dispute') ||
            result.has(row.stripe_object_id)) {
          throw new AuditFailure('source_inconsistent');
        }
        result.set(row.stripe_object_id, row.kind);
      }
      offset += page.data.length;
      if (offset > count) throw new AuditFailure('source_inconsistent');
    } while (offset < count);
  }
  return result;
}

async function collectReceipts(
  sources: AuditSources, now: Date, budget: { used: number },
): Promise<FinancialGapReport['uncertainReceipts']> {
  const output: FinancialGapReport['uncertainReceipts'] = [];
  const seen = new Set<string>();
  const allowedTypes = new Set<string>(FINANCIAL_EVENT_TYPES);
  const cutoff = now.getTime() - STALE_MS;
  const cutoffIso = new Date(cutoff).toISOString();
  for (const group of ['failed', 'stale'] as const) {
    const previousGroups = output.length;
    let offset = 0;
    let count: number | null = null;
    do {
      if (++budget.used > MAX_DB_PAGES) throw new AuditFailure('limit_exceeded');
      const page = await callSource('database_unavailable', () =>
        sources.listReceipts(group, cutoffIso, offset, PAGE_SIZE));
      if (page && Number.isSafeInteger(page.count) &&
          page.count + previousGroups > MAX_RECEIPTS) throw new AuditFailure('limit_exceeded');
      if (!page || !Array.isArray(page.data) || !Number.isSafeInteger(page.count) ||
          page.count < 0 ||
          page.data.length > PAGE_SIZE || (count !== null && page.count !== count) ||
          (offset < page.count && page.data.length === 0)) {
        throw new AuditFailure('source_inconsistent');
      }
      count = page.count;
      for (const row of page.data) {
        const received = Date.parse(row?.received_at ?? '');
        if (!row || !EVENT_ID.test(row.id) || !allowedTypes.has(row.type) ||
            seen.has(row.id) || !Number.isFinite(received) ||
            (group === 'failed' && row.processing_status !== 'failed') ||
            (group === 'stale' &&
              (!['processing', 'retryable'].includes(row.processing_status) ||
                received >= cutoff))) {
          throw new AuditFailure('source_inconsistent');
        }
        seen.add(row.id);
        output.push({ id: row.id, type: row.type, status: row.processing_status });
      }
      offset += page.data.length;
      if (offset > count) throw new AuditFailure('source_inconsistent');
    } while (offset < count);
  }
  return output.sort((a, b) => a.id.localeCompare(b.id));
}

/** There is deliberately no write, replay, refund, or claim in this interface. */
export async function auditStripeFinancialGaps(
  window: AuditWindow, sources: AuditSources, now = new Date(),
): Promise<FinancialGapReport> {
  await callSource('database_unavailable', () => sources.probeSchema());
  const refundIds = await collectStripe('refund', window, sources);
  const disputeIds = await collectStripe('dispute', window, sources);
  const budget = { used: 0 };
  const cases = await collectCases([...refundIds, ...disputeIds], sources, budget);
  const missingRefundIds = refundIds.filter((id) => !cases.has(id)).sort();
  const missingDisputeIds = disputeIds.filter((id) => !cases.has(id)).sort();
  for (const id of refundIds) {
    if (cases.has(id) && cases.get(id) !== 'refund') throw new AuditFailure('source_inconsistent');
  }
  for (const id of disputeIds) {
    if (cases.has(id) && cases.get(id) !== 'dispute') throw new AuditFailure('source_inconsistent');
  }
  const uncertainReceipts = await collectReceipts(sources, now, budget);
  return {
    status: missingRefundIds.length || missingDisputeIds.length || uncertainReceipts.length
      ? 'attention' : 'no_gaps_detected',
    mode: window.mode,
    window: { from: window.from, to: window.to, timezone: 'UTC', upperBound: 'exclusive' },
    observedAt: now.toISOString(),
    scope: 'supplied_stripe_key_and_database_in_window',
    databaseEnvironmentVerified: false,
    receiptScope: 'all_financial_failed_or_stale_not_window_limited',
    stripeCounts: { refunds: refundIds.length, disputes: disputeIds.length },
    missingRefundIds, missingDisputeIds, uncertainReceipts,
  };
}
