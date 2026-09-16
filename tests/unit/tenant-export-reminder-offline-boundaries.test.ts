import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), qr: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/ksef/qr-codes', () => ({ generateOfflineQrCodes: mocks.qr }));

import { fetchInvoicesForExport } from '@/lib/exports/data-fetcher';
import { decideNextReminder, findInvoicesRequiringReminders } from '@/lib/reminders/scheduler';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import { generateIdempotencyKey } from '@/lib/ksef/idempotency';

type Row = Record<string, unknown>;
type Result = { data: Row[] | Row | null; count?: number; error: { code: string; message: string } | null };
type Operation = { table: string; mode: string; selection: string; filters: Array<[string, unknown]> };
let tables: Record<string, Row[]>;
let operations: Operation[];
let errorFor: (op: Operation) => boolean;
let conflict = false;

function database() {
  return { from(table: string) {
    const op: Operation = { table, mode: 'select', selection: '', filters: [] };
    const predicates: Array<(row: Row) => boolean> = [];
    let patch: Row = {};
    let count = false;
    let singular = false;
    const query = {
      select(selection = '*', options?: { count?: string }) { op.selection = selection; count = !!options?.count; return query; },
      insert(value: Row) { op.mode = 'insert'; patch = value; return query; },
      update(value: Row) { op.mode = 'update'; patch = value; return query; },
      eq(key: string, value: unknown) { op.filters.push([key, value]); predicates.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { op.filters.push([key, values]); predicates.push(row => values.includes(row[key])); return query; },
      gte(key: string, value: string) { predicates.push(row => String(row[key]) >= value); return query; },
      lte(key: string, value: string) { predicates.push(row => String(row[key]) <= value); return query; },
      lt(key: string, value: string) { predicates.push(row => String(row[key]) < value); return query; },
      order() { return query; },
      limit() { return query; },
      single() { singular = true; return query; },
      maybeSingle() { singular = true; return query; },
      then(resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) {
        operations.push(op);
        if (errorFor(op) || (conflict && op.mode === 'insert' && table === 'ksef_offline_queue')) {
          return Promise.resolve({ data: null, error: { code: conflict ? '23505' : 'XX000', message: 'fixture failure' } }).then(resolve, reject);
        }
        const rows = (tables[table] ?? []).filter(row => predicates.every(p => p(row)));
        if (op.mode === 'insert') { const inserted = { id: 'new-queue', ...patch }; (tables[table] ??= []).push(inserted); rows.splice(0, rows.length, inserted); }
        if (op.mode === 'update') rows.forEach(row => Object.assign(row, patch));
        return Promise.resolve({ data: singular ? rows[0] ?? null : rows, count: count ? rows.length : undefined, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

function invoice(id: string, tenant = 'tenant-a', direction = 'outgoing'): Row {
  return {
    id, tenant_id: tenant, direction, invoice_kind: 'regular', ksef_status: 'accepted',
    internal_number: id, issue_date: '2026-01-01', created_at: '2026-01-01T12:00:00Z',
    buyer_data: { email: 'buyer@example.test' }, buyer_nip: null, seller_nip: '1234567890',
    gross_total: 100, paid_amount: 0, payment_due_date: '2025-01-01',
    payment_status: 'unpaid', reminders_paused: false, fa3_data: null, tenants: { nip: '1234567890' },
  };
}
const exportParams = { tenantId: 'tenant-a', periodStart: '2026-01-01', periodEnd: '2026-01-31', direction: 'both' as const };
const scheduleInput = {
  id: 'invoice-a', tenant_id: 'tenant-a', internal_number: 'A', gross_total: 100, paid_amount: 0,
  payment_due_date: '2025-01-01', reminders_paused: false, buyer_data: { email: 'buyer@example.test' },
};
const offlineParams = { tenantId: 'tenant-a', invoiceId: 'invoice-a', certificate: 'fake-certificate', isMfOutage: false };

beforeEach(() => {
  tables = {
    tenants: [{ id: 'tenant-a', name: 'A', nip: '1234567890', address_json: null }],
    invoices: [invoice('invoice-a'), invoice('invoice-b', 'tenant-b')],
    invoice_line_items: [], ksef_offline_queue: [], payment_reminders: [],
    reminder_settings: [{
      tenant_id: 'tenant-a', enabled: true, max_reminders_per_invoice: 3,
      stage_1_enabled: true, stage_2_enabled: true, stage_3_enabled: true,
      stage_1_days_after_due: 1, stage_2_days_after_due: 1, stage_3_days_after_due: 1,
      send_hour: 10, send_on_weekdays_only: false,
    }],
  };
  operations = []; errorFor = () => false; conflict = false;
  mocks.admin.mockReset().mockImplementation(database);
  mocks.qr.mockReset().mockResolvedValue({ offlinePayload: 'offline-fixture', certyfikatPayload: 'certificate-fixture' });
});

describe('tenant boundaries for accounting exports', () => {
  it('maps both public directions to database values and excludes other tenants', async () => {
    tables.invoices.push(invoice('incoming-a', 'tenant-a', 'incoming'), invoice('incoming-b', 'tenant-b', 'incoming'));
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices.map(row => row.invoiceNumber)).toEqual(['invoice-a']);
    expect(data.receivedInvoices.map(row => row.invoiceNumber)).toEqual(['incoming-a']);
  });

  it('preserves a same-tenant correction parent outside the exported date period', async () => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: 'parent-a' });
    tables.invoices.push({ ...invoice('parent-a'), issue_date: '2025-01-01', internal_number: 'ORIGINAL-A' });
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices[0].correctedInvoiceNumber).toBe('ORIGINAL-A');
  });

  it.each(['invoice-b', 'missing-parent'])('rejects foreign or missing correction parents: %s', async parent => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: parent });
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('Linked invoice not found in organization');
  });

  it('uses line item IDs derived from own invoices', async () => {
    tables.invoice_line_items = [
      { invoice_id: 'invoice-a', ordinal: 1, name: 'OWN', quantity: 1, unit_price_net: 100, net_amount: 100, vat_rate: '23' },
      { invoice_id: 'invoice-b', ordinal: 1, name: 'PRIVATE', quantity: 1, unit_price_net: 100, net_amount: 100, vat_rate: '23' },
    ];
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices[0].lines.map(row => row.name)).toEqual(['OWN']);
  });
});

describe('reminder decisions distrust invoice-only foreign relationships', () => {
  it.each(['sent', 'pending'])('ignores foreign %s reminders attached to own invoice', async status => {
    tables.payment_reminders = ['stage_1', 'stage_2', 'stage_3'].map(stage => ({
      tenant_id: 'tenant-b', invoice_id: 'invoice-a', status, stage,
    }));
    expect(await decideNextReminder(scheduleInput)).toMatchObject({ shouldSend: true, stage: 'stage_1' });
  });

  it('keeps the real tenant reminder limit', async () => {
    tables.payment_reminders = ['stage_1', 'stage_2', 'stage_3'].map(stage => ({
      tenant_id: 'tenant-a', invoice_id: 'invoice-a', status: 'sent', stage,
    }));
    expect(await decideNextReminder(scheduleInput)).toMatchObject({ shouldSend: false, skipReason: expect.stringContaining('limit') });
  });

  it('skips an own pending stage', async () => {
    tables.payment_reminders = [{ tenant_id: 'tenant-a', invoice_id: 'invoice-a', status: 'pending', stage: 'stage_1' }];
    expect(await decideNextReminder(scheduleInput)).toMatchObject({ shouldSend: true, stage: 'stage_2' });
  });

  it.each(['id', 'stage, status'])('stops the decision on unavailable reminder evidence: %s', async selection => {
    errorFor = op => op.table === 'payment_reminders' && op.selection === selection;
    await expect(decideNextReminder(scheduleInput)).rejects.toThrow('Could not verify reminder');
  });

  it('finds outgoing database rows for the global scheduler', async () => {
    tables.invoices.push(invoice('incoming-a', 'tenant-a', 'incoming'));
    const candidates = await findInvoicesRequiringReminders();
    expect(candidates.map(row => row.id)).toEqual(['invoice-a', 'invoice-b']);
  });
});

describe('offline helper tenant ownership', () => {
  it('rejects a foreign invoice before QR generation or writes', async () => {
    await expect(addToOfflineQueue({ ...offlineParams, invoiceId: 'invoice-b' })).rejects.toThrow('Invoice not found');
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(operations.some(op => op.mode !== 'select')).toBe(false);
  });

  it('enqueues and updates only the owned invoice', async () => {
    const result = await addToOfflineQueue(offlineParams);
    expect(result.tenant_id).toBe('tenant-a');
    expect(tables.invoices[0].ksef_status).toBe('offline_queued');
    expect(tables.invoices[1].ksef_status).toBe('accepted');
    expect(operations.find(op => op.table === 'invoices' && op.mode === 'update')?.filters).toContainEqual(['tenant_id', 'tenant-a']);
  });

  it.each([
    { tenant_id: 'tenant-b', invoice_id: 'invoice-a' },
    { tenant_id: 'tenant-a', invoice_id: 'invoice-b' },
  ])('rejects a conflicting row with mismatched ownership: %j', async relationship => {
    conflict = true;
    tables.ksef_offline_queue.push({
      id: 'foreign-queue', ...relationship,
      idempotency_key: generateIdempotencyKey('tenant-a', 'invoice-a', new Date('2026-01-01T12:00:00Z')),
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Offline queue conflict could not be verified');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
  });

  it('preserves idempotent retries of an owned queue row', async () => {
    conflict = true;
    tables.ksef_offline_queue.push({
      id: 'existing-queue', tenant_id: 'tenant-a', invoice_id: 'invoice-a',
      idempotency_key: generateIdempotencyKey('tenant-a', 'invoice-a', new Date('2026-01-01T12:00:00Z')),
    });
    expect((await addToOfflineQueue(offlineParams)).id).toBe('existing-queue');
  });

  it('does not claim success when invoice ownership changes before the write', async () => {
    mocks.qr.mockImplementation(async () => {
      tables.invoices[0].tenant_id = 'tenant-b';
      return { offlinePayload: 'offline-fixture', certyfikatPayload: 'certificate-fixture' };
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Invoice could not be updated');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
  });
});
