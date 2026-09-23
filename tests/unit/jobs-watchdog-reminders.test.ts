import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;
type Query = { table: string; selection: string; exactCount: boolean; filters: Array<[string, unknown]> };
const mocks = vi.hoisted(() => ({ db: vi.fn(), capture: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('@/lib/flo/db-types', () => ({ floDb: mocks.db }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.capture }));
import { runJobsWatchdog } from '@/lib/inngest/jobs/jobs-watchdog';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const IDS = ['approval-receipt', 'approval-dispatch', 'approval-legacy', 'approval-missing'];
let rows: Record<string, Row[]>;
let queries: Query[];
let approvalLookupFails: boolean;
let missingReminderCount: boolean;
function value(row: Row, path: string): unknown {
  if (!path.startsWith('snapshot->>')) return row[path];
  const key = path.slice('snapshot->>'.length);
  const snapshot = row.snapshot as Row | undefined;
  return snapshot?.[key] ?? null;
}
function db() {
  return { from(table: string) {
    const query: Query = { table, selection: '*', exactCount: false, filters: [] };
    queries.push(query);
    let maximum = Infinity;
    const filters: Array<(row: Row) => boolean> = [];
    const execute = () => {
      if (table === 'flo_approvals' && approvalLookupFails) {
        return { data: null, error: { message: 'PRIVATE DB DIAGNOSTIC' } };
      }
      const matching = (rows[table] ?? []).filter((row) => filters.every((test) => test(row)));
      const selected = matching.slice(0, maximum)
        .map((row) => query.selection === 'id' ? { id: row.id } : structuredClone(row));
      return { data: selected, error: null,
        count: query.exactCount ? (missingReminderCount ? null : matching.length) : null };
    };
    const builder = {
      select: (selection: string, options?: { count?: 'exact' }) => { query.selection = selection; query.exactCount = options?.count === 'exact'; return builder; },
      eq: (key: string, expected: unknown) => { query.filters.push([key, expected]); filters.push((row) => value(row, key) === expected); return builder; },
      lt: (key: string, expected: string) => { query.filters.push([key, expected]); filters.push((row) => String(value(row, key)) < expected); return builder; },
      in: (key: string, expected: string[]) => { query.filters.push([key, expected]); filters.push((row) => expected.includes(String(value(row, key)))); return builder; },
      is: (key: string, expected: null) => { query.filters.push([key, expected]); filters.push((row) => value(row, key) === expected); return builder; },
      order: () => builder,
      limit: (count: number) => { maximum = count; return builder; },
      then: <T = ReturnType<typeof execute>, E = never>(
        resolve?: ((value: ReturnType<typeof execute>) => T | PromiseLike<T>) | null,
        reject?: ((reason: unknown) => E | PromiseLike<E>) | null,
      ) => Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  } };
}
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const context: JobContext = { attempt: 0, logger, step: {
  run: async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> =>
    JSON.parse(JSON.stringify(await fn())) as T,
  sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn(),
} };
function pending(id: string, scheduledFor: string): Row {
  return { id, tenant_id: 'SECRET-TENANT', invoice_id: 'SECRET-INVOICE', stage: 'stage_1',
    status: 'pending', scheduled_for: scheduledFor };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks();
  approvalLookupFails = false; missingReminderCount = false; queries = [];
  rows = { export_jobs: [],
    payment_reminders: IDS.map((id) => pending(id, '2026-09-23T11:29:59.000Z')),
    flo_approvals: [
      { id: IDS[0], snapshot: { reminderDispatch: { reminderId: IDS[0] },
        reminderReceipt: { messageId: 'SECRET-MAIL', body: 'SECRET-BODY' } } },
      { id: IDS[1], snapshot: { reminderDispatch: { reminderId: IDS[1] }, body: 'SECRET-BODY' } },
      { id: IDS[2], snapshot: { body: 'legacy' } },
    ],
  };
  mocks.db.mockImplementation(db);
});

describe('pending reminder recovery alert', () => {
  it('classifies receipt, dispatch without receipt and legacy/missing approval after 30 minutes without exposing message data', async () => {
    rows.payment_reminders.push(pending('too-new', '2026-09-23T11:30:00.000Z'));
    const result = await runJobsWatchdog(context);
    expect(result).toMatchObject({ stuckReminders: 4 });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [title, options] = mocks.capture.mock.calls[0];
    expect(title).toBe('jobs-watchdog: stuck payment_reminders');
    expect(options.extra.thresholdMinutes).toBe(30);
    expect(options.extra.reminders.map((r: Row) => [r.id, r.recoveryState])).toEqual([
      [IDS[0], 'receipt_marker_recorded'], [IDS[1], 'dispatch_without_receipt'],
      [IDS[2], 'missing_dispatch_or_legacy'], [IDS[3], 'missing_dispatch_or_legacy'],
    ]);
    expect(JSON.stringify(options)).not.toMatch(/SECRET|snapshot|messageId|body/i);
    expect(queries.filter((q) => q.table === 'flo_approvals').map((q) => q.selection)).toEqual(['id', 'id', 'id']);
  });

  it('still alerts when approval lookup is unavailable, without claiming delivery state', async () => {
    approvalLookupFails = true;
    const result = await runJobsWatchdog(context);
    expect(result).toMatchObject({ stuckReminders: 4 });
    const details = mocks.capture.mock.calls[0][1].extra.reminders as Array<{ recoveryState: string }>;
    expect(details.every((r) => r.recoveryState === 'approval_lookup_unavailable')).toBe(true);
    expect(JSON.stringify(mocks.capture.mock.calls[0])).not.toContain('PRIVATE DB DIAGNOSTIC');
  });

  it('reports the true total and truncation when more than 50 pending rows exist', async () => {
    rows.payment_reminders = Array.from({ length: 55 }, (_, index) =>
      pending('approval-' + index, '2026-09-23T11:00:00.000Z'));
    const result = await runJobsWatchdog(context);
    expect(result).toMatchObject({ stuckReminders: 55 });
    const options = mocks.capture.mock.calls[0][1];
    expect(options.tags).toMatchObject({ count: '55', countVerified: 'true', truncated: 'true' });
    expect(options.extra).toMatchObject({ totalPending: 55, shown: 50, truncated: true });
    expect(options.extra.reminders).toHaveLength(50);
    expect(JSON.stringify(options)).not.toMatch(/SECRET|snapshot|body/i);
    expect(queries.find((q) => q.table === 'payment_reminders')?.exactCount).toBe(true);
  });

  it('alerts with unknown count when PostgREST returns no rows and no exact count', async () => {
    rows.payment_reminders = [];
    missingReminderCount = true;
    const result = await runJobsWatchdog(context);
    expect(result).toMatchObject({ stuckReminders: 0 });
    const options = mocks.capture.mock.calls[0][1];
    expect(options.tags).toMatchObject({ count: 'unknown', countVerified: 'false', truncated: 'true' });
    expect(options.extra).toMatchObject({ totalPending: null, shown: 0, truncated: true });
    expect(logger.info).not.toHaveBeenCalledWith('Watchdog: brak zawieszonych jobów');
  });

  it('does not query the approval ledger or alert for fresh pending reminders', async () => {
    rows.payment_reminders = [pending('fresh', '2026-09-23T11:30:00.000Z')];
    expect(await runJobsWatchdog(context)).toMatchObject({ stuckReminders: 0 });
    expect(queries.some((q) => q.table === 'flo_approvals')).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
