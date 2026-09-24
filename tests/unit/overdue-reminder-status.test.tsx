import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Query = { table: string; selection: string; exactCount: boolean; filters: Array<[string, unknown]> };
const mocks = vi.hoisted(() => ({ client: vi.fn(), activeOrg: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/dashboard-shell-data', () => ({ getDashboardOrgSwitcherProps: mocks.activeOrg }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: vi.fn() }));
vi.mock('@/components/reminders/reminder-consent-dialog', () => ({ ReminderConsentDialog: () => null }));
vi.mock('@/app/actions/reminders', () => ({ toggleInvoiceRemindersAction: vi.fn() }));
import OverduePage from '@/app/(dashboard)/payments/overdue/page';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVOICE = '11111111-1111-4111-8111-111111111111';
let rows: Record<string, Row[]>;
let queries: Query[];
let failReminderRead: boolean;
let missingCount: boolean;
let serverCap: number;
let injectUnexpectedReminder: boolean;
function invoice(id: string, tenantId: string): Row {
  return { id, tenant_id: tenantId, internal_number: id === INVOICE ? 'VISIBLE-1' : 'FOREIGN-1',
    payment_due_date: '2026-09-01', gross_total: 100, amount_due: 100,
    days_overdue: 22, buyer_name: 'Buyer', buyer_nip: null, buyer_email: 'buyer@example.test',
    reminders_paused: false, reminders_sent_count: 0 };
}
function reminder(invoiceId: string, tenantId: string, scheduledFor: string): Row {
  return { invoice_id: invoiceId, tenant_id: tenantId, scheduled_for: scheduledFor, status: 'pending' };
}
function client() {
  return { from(table: string) {
    const query: Query = { table, selection: '*', exactCount: false, filters: [] };
    queries.push(query);
    const filters: Array<(row: Row) => boolean> = [];
    let maximum = Infinity;
    const execute = () => {
      if (table === 'payment_reminders' && failReminderRead) {
        return { data: null, error: { message: 'PRIVATE ERROR' } };
      }
      const matching = (rows[table] ?? []).filter((row) => filters.every((test) => test(row)));
      if (table === 'payment_reminders' && injectUnexpectedReminder) {
        matching.push(reminder('unexpected-invoice', TENANT, '2026-09-23T11:00:00.000Z'));
      }
      const data = matching.slice(0, Math.min(maximum, serverCap)).map((row) => structuredClone(row));
      return { data, error: null, count: query.exactCount ? (missingCount ? null : matching.length) : null };
    };
    const builder = {
      select: (selection: string, options?: { count?: 'exact' }) => { query.selection = selection; query.exactCount = options?.count === 'exact'; return builder; },
      eq: (key: string, expected: unknown) => { query.filters.push([key, expected]); filters.push((row) => row[key] === expected); return builder; },
      in: (key: string, expected: string[]) => { query.filters.push([key, expected]); filters.push((row) => expected.includes(String(row[key]))); return builder; },
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
async function markup() { return renderToStaticMarkup(await OverduePage()); }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
  queries = []; failReminderRead = false; missingCount = false; serverCap = Infinity;
  injectUnexpectedReminder = false;
  rows = { invoices_overdue: [invoice(INVOICE, TENANT)], payment_reminders: [] };
  mocks.client.mockResolvedValue(client());
  mocks.activeOrg.mockResolvedValue({ activeOrgId: TENANT });
});
afterEach(() => vi.useRealTimers());

describe('overdue reminder status', () => {
  it('shows pending only for a visible invoice of the validated active tenant', async () => {
    rows.invoices_overdue.push(invoice('22222222-2222-4222-8222-222222222222', FOREIGN));
    rows.payment_reminders.push(reminder(INVOICE, TENANT, '2026-09-23T11:40:00.000Z'));
    rows.payment_reminders.push(reminder('22222222-2222-4222-8222-222222222222', FOREIGN, '2026-09-23T11:00:00.000Z'));
    const html = await markup();
    expect(html).toContain('Oczekuje na wysyłkę');
    expect(html).toContain('Stan przypomnień jest orientacyjny.');
    expect(html).not.toContain('FOREIGN-1');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Przypomnienie już zlecone"/);
    const view = queries.find((q) => q.table === 'invoices_overdue')!;
    const pending = queries.find((q) => q.table === 'payment_reminders')!;
    expect(view.filters).toContainEqual(['tenant_id', TENANT]);
    expect(pending.filters).toEqual(expect.arrayContaining([
      ['tenant_id', TENANT], ['invoice_id', [INVOICE]], ['status', 'pending'],
    ]));
    expect(pending.selection).toBe('invoice_id, scheduled_for');
    expect(pending.exactCount).toBe(true);
  });

  it('shows manual review after more than 30 minutes and no repeat-prepare action', async () => {
    rows.payment_reminders = [reminder(INVOICE, TENANT, '2026-09-23T11:29:59.000Z')];
    const html = await markup();
    expect(html).toContain('Wymaga weryfikacji wysyłki');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Wysyłka wymaga weryfikacji"/);
    expect(html).not.toContain('aria-label="Przygotuj przypomnienie"');
  });

  it('does not turn a failed status read into a claim that nothing is pending', async () => {
    failReminderRead = true;
    const html = await markup();
    expect(html).toContain('Stan wysyłki niedostępny');
    expect(html).not.toContain('aria-label="Przygotuj przypomnienie"');
    expect(html).not.toContain('PRIVATE ERROR');
  });

  it('shows unavailable when PostgREST truncates a full 100-invoice result', async () => {
    rows.invoices_overdue = Array.from({ length: 100 }, (_, index) =>
      invoice(index === 0 ? INVOICE : 'invoice-' + index, TENANT));
    rows.payment_reminders = rows.invoices_overdue.flatMap((item) =>
      Array.from({ length: 4 }, (_, stage) => reminder(String(item.id), TENANT,
        stage === 0 ? '2026-09-23T11:20:00.000Z' : '2026-09-23T11:40:00.000Z')));
    serverCap = 100;
    const page = await OverduePage();
    const statuses = (page.props as { overdueInvoices: Array<{ reminder_status: string }> }).overdueInvoices;
    expect(statuses).toHaveLength(100);
    expect(statuses.every((item) => item.reminder_status === 'unavailable')).toBe(true);
    expect(queries.find((q) => q.table === 'payment_reminders')?.exactCount).toBe(true);
  });

  it('fails closed if an inconsistent result includes an invoice outside the visible set', async () => {
    injectUnexpectedReminder = true;
    const html = await markup();
    expect(html).toContain('Stan wysyłki niedostępny');
    expect(html).not.toContain('aria-label="Przygotuj przypomnienie"');
  });

  it('shows unavailable when PostgREST omits the exact count, including an empty response', async () => {
    missingCount = true;
    const html = await markup();
    expect(html).toContain('Stan wysyłki niedostępny');
    expect(html).not.toContain('aria-label="Przygotuj przypomnienie"');
  });

  it('leaves fresh preparation available only when the status read succeeds and finds no pending row', async () => {
    const html = await markup();
    expect(html).toContain('aria-label="Przygotuj przypomnienie"');
    expect(html).not.toContain('Wymaga weryfikacji wysyłki');
  });
});
