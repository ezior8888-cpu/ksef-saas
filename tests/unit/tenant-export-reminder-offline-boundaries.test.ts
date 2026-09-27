import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    let head = false;
    let singular = false;
    let window: [number, number] | null = null;
    const query = {
      range(from: number, to: number) { window = [from, to]; return query; },
      select(selection = '*', options?: { count?: string; head?: boolean }) { op.selection = selection; count = !!options?.count; head = !!options?.head; return query; },
      insert(value: Row) { op.mode = 'insert'; patch = value; return query; },
      update(value: Row) { op.mode = 'update'; patch = value; return query; },
      eq(key: string, value: unknown) { op.filters.push([key, value]); predicates.push(row => row[key] === value); return query; },
      neq(key: string, value: unknown) { op.filters.push([`${key} !=`, value]); predicates.push(row => row[key] !== value); return query; },
      in(key: string, values: unknown[]) { op.filters.push([key, values]); predicates.push(row => values.includes(row[key])); return query; },
      or(filter: string) {
        const match = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(filter);
        if (!match) throw new Error(`Unexpected OR filter ${filter}`);
        predicates.push(row => row.ksef_environment == null || row.ksef_environment !== match[1]);
        return query;
      },
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
        const matching = (tables[table] ?? []).filter(row => predicates.every(p => p(row)));
        const rows = window ? matching.slice(window[0], window[1] + 1) : matching;
        if (op.mode === 'insert') { const inserted = { id: 'new-queue', ...patch }; (tables[table] ??= []).push(inserted); rows.splice(0, rows.length, inserted); }
        if (op.mode === 'update') rows.forEach(row => Object.assign(row, patch));
        return Promise.resolve({ data: head ? null : singular ? rows[0] ?? null : rows, count: count ? rows.length : undefined, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

function invoice(id: string, tenant = 'tenant-a', direction = 'outgoing'): Row {
  return {
    id, tenant_id: tenant, direction, invoice_kind: 'regular', ksef_status: 'accepted', ksef_environment: 'test',
    internal_number: id, issue_date: '2026-01-01', created_at: '2026-01-01T12:00:00Z',
    buyer_data: { email: 'buyer@example.test' }, buyer_nip: null, seller_nip: '1234567890',
    gross_total: 100, paid_amount: 0, payment_due_date: '2025-01-01',
    payment_status: 'unpaid', reminders_paused: false, fa3_data: null,
    tenants: { nip: '1234567890', ksef_verified_at: '2026-01-01T12:00:00Z', ksef_verified_environment: 'test' },
  };
}
const exportParams = { tenantId: 'tenant-a', periodStart: '2026-01-01', periodEnd: '2026-01-31', direction: 'both' as const };
const scheduleInput = {
  id: 'invoice-a', tenant_id: 'tenant-a', internal_number: 'A', gross_total: 100, paid_amount: 0,
  payment_due_date: '2025-01-01', reminders_paused: false, buyer_data: { email: 'buyer@example.test' },
};
const offlineParams = { tenantId: 'tenant-a', invoiceId: 'invoice-a', certificate: 'fake-certificate', isMfOutage: false };

beforeEach(() => {
  vi.stubEnv('KSEF_ENV', 'test');
  tables = {
    tenants: [{ id: 'tenant-a', name: 'A', nip: '1234567890', address_json: null }],
    invoices: [invoice('invoice-a'), invoice('invoice-b', 'tenant-b')],
    invoice_line_items: [], ksef_offline_queue: [], payment_reminders: [], expenses: [],
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
afterEach(() => vi.unstubAllEnvs());

describe('tenant boundaries for accounting exports', () => {
  it('maps both public directions to database values and excludes other tenants', async () => {
    tables.invoices.push(invoice('incoming-a', 'tenant-a', 'incoming'), invoice('incoming-b', 'tenant-b', 'incoming'));
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices.map(row => row.invoiceNumber)).toEqual(['invoice-a']);
    expect(data.receivedInvoices.map(row => row.invoiceNumber)).toEqual(['incoming-a']);
  });

  it('blocks JPK before mapping when the requested period contains TEST/PROD mismatches or unknown provenance', async () => {
    tables.invoices.push(
      { ...invoice('prod-a'), ksef_environment: 'production' },
      { ...invoice('legacy-a'), ksef_environment: null },
    );
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('require KSeF environment reconciliation');
    expect(operations.filter(op => op.table === 'invoices' && op.selection === '*')).toEqual([]);
  });

  it('applies the environment filter to both directions after a clean preflight', async () => {
    tables.invoices.push(invoice('incoming-a', 'tenant-a', 'incoming'));
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices.map(row => row.invoiceNumber)).toEqual(['invoice-a']);
    expect(data.receivedInvoices.map(row => row.invoiceNumber)).toEqual(['incoming-a']);
    const selected = operations.filter(op => op.table === 'invoices' && op.selection === '*');
    expect(selected).toHaveLength(2);
    for (const operation of selected) expect(operation.filters).toContainEqual(['ksef_environment', 'test']);
  });

  it('fails closed when provenance count cannot be checked', async () => {
    errorFor = op => op.table === 'invoices' && op.selection === 'id';
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('check is unavailable');
    expect(operations.filter(op => op.table === 'invoices' && op.selection === '*')).toEqual([]);
  });

  it('rejects an unset KSeF environment before using the privileged DB client', async () => {
    vi.stubEnv('KSEF_ENV', '');
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('not safely configured');
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('costs come from own expenses the tenant accepted as a cost — never another tenant', async () => {
    // Od 26.09 koszty w KPiR/JPK_V7M idą z `expenses`, nie z faktur otrzymanych.
    const expense = (id: string, tenant: string, isDeductible: boolean): Row => ({
      id, tenant_id: tenant, issue_date: '2026-01-10', document_number: id, document_type: 'invoice',
      seller_name: 'Dostawca', seller_nip: '5260001246', seller_address: null,
      net_amount: 100, vat_amount: 23, gross_amount: 123, vat_deductible_amount: 23,
      kpir_column: 'col_13', category_label: 'Usługi', is_deductible: isDeductible,
    });
    tables.expenses.push(
      expense('exp-a', 'tenant-a', true),
      expense('exp-a-not-a-cost', 'tenant-a', false),
      expense('exp-b', 'tenant-b', true),
    );
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.expenses.map(row => row.id)).toEqual(['exp-a']);
    expect(data.expenses[0]).toMatchObject({ sellerName: 'Dostawca', sellerNip: '5260001246', vatDeductibleAmount: 23 });
  });

  it('issued-only export does not read expenses at all', async () => {
    const data = await fetchInvoicesForExport({ ...exportParams, direction: 'issued' });
    expect(data.expenses).toEqual([]);
    expect(operations.some(op => op.table === 'expenses')).toBe(false);
  });

  it('preserves a same-tenant correction parent outside the exported date period', async () => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: 'parent-a' });
    tables.invoices.push({ ...invoice('parent-a'), issue_date: '2025-01-01', internal_number: 'ORIGINAL-A' });
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.issuedInvoices[0].correctedInvoiceNumber).toBe('ORIGINAL-A');
  });

  it('rejects a correction whose parent was accepted in another KSeF environment', async () => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: 'parent-a' });
    tables.invoices.push({ ...invoice('parent-a'), issue_date: '2025-01-01', internal_number: 'TEST-PARENT', ksef_environment: 'production' });
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('Linked invoice not found in organization');
  });

  it.each([
    { ksef_status: 'draft' },
    { direction: 'incoming' },
  ])('rejects a correction parent that is not an accepted invoice in the same direction: %j', async patch => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: 'parent-a' });
    tables.invoices.push({ ...invoice('parent-a'), internal_number: 'INVALID-PARENT', ...patch });
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('Linked invoice not found in organization');
  });

  it.each(['invoice-b', 'missing-parent'])('rejects foreign or missing correction parents: %s', async parent => {
    Object.assign(tables.invoices[0], { invoice_kind: 'correction', parent_invoice_id: parent });
    await expect(fetchInvoicesForExport(exportParams)).rejects.toThrow('Linked invoice not found in organization');
  });

  it('received invoice from the KSeF inbox carries its SELLER (from fa3_data metadata)', async () => {
    // Skrzynka zapisuje fakturę bez seller_data/buyer_data — strony są tylko
    // w metadanych. Do 26.09 eksport znał tylko nabywcę, więc zakup miał
    // jako kontrahenta naszą firmę (albo pustkę).
    tables.invoices.push({
      ...invoice('inbox-a', 'tenant-a', 'incoming'),
      buyer_data: null, buyer_nip: null, seller_nip: '5260001246',
      fa3_data: {
        _source: 'inbox-metadata',
        seller: { nip: '5260001246', name: 'Dostawca Sp. z o.o.' },
        buyer: { identifier: { type: 'Nip', value: '1234567890' }, name: 'A' },
      },
    });
    const data = await fetchInvoicesForExport(exportParams);
    expect(data.receivedInvoices.find(row => row.invoiceNumber === 'inbox-a')).toMatchObject({
      sellerName: 'Dostawca Sp. z o.o.', sellerNip: '5260001246', buyerName: 'A', buyerNip: '1234567890',
    });
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
    // Faktury wystawione w aplikacji (`origin`, 00065) — import historii
    // odpada z cronu ponagleń (reminders-kandydaci.test.ts).
    for (const row of tables.invoices) row.origin = 'app';
    tables.invoices.push(invoice('incoming-a', 'tenant-a', 'incoming'));
    const candidates = await findInvoicesRequiringReminders();
    expect(candidates.map(row => row.id)).toEqual(['invoice-a', 'invoice-b']);
  });
});

describe('offline helper tenant ownership', () => {
  beforeEach(() => {
    tables.invoices[0].ksef_status = 'draft';
    tables.invoices[0].invoice_type = 'VAT';
    tables.invoices[0].fa3_data = { type: 'VAT' };
  });

  it('rejects PROD Offline24 before opening the admin client, generating QR or writing', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Offline24 PROD is disabled');
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(operations).toEqual([]);
  });

  it('rejects a foreign invoice before QR generation or writes', async () => {
    await expect(addToOfflineQueue({ ...offlineParams, invoiceId: 'invoice-b' })).rejects.toThrow('Invoice not found');
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(operations.some(op => op.mode !== 'select')).toBe(false);
  });

  it.each([
    ['correction', 'KOR'],
    ['advance', 'ZAL'],
    ['final', 'ROZ'],
  ])('never parks a %s as an ordinary Offline24 document', async (kind, type) => {
    tables.invoices[0].invoice_kind = kind;
    tables.invoices[0].invoice_type = type;
    tables.invoices[0].fa3_data = { type };
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('cannot safely replay');
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(operations.some(op => op.mode !== 'select')).toBe(false);
  });

  it('rejects a regular-labelled row whose stored XML payload is a correction', async () => {
    tables.invoices[0].fa3_data = { type: 'KOR' };
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('cannot safely replay');
    expect(mocks.qr).not.toHaveBeenCalled();
  });

  it('does not park an already accepted invoice', async () => {
    tables.invoices[0].ksef_status = 'accepted';
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Accepted invoice');
    expect(mocks.qr).not.toHaveBeenCalled();
  });

  it('enqueues and updates only the owned invoice', async () => {
    const result = await addToOfflineQueue(offlineParams);
    expect(result.tenant_id).toBe('tenant-a');
    expect(result.ksef_environment).toBe('test');
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
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });

  it('refuses to relabel a legacy queued invoice with the current environment', async () => {
    conflict = true;
    tables.ksef_offline_queue.push({
      id: 'legacy-queue', tenant_id: 'tenant-a', invoice_id: 'invoice-a',
      ksef_environment: null,
      idempotency_key: generateIdempotencyKey('tenant-a', 'invoice-a', new Date('2026-01-01T12:00:00Z')),
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('no matching KSeF environment');
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });

  it('preserves idempotent retries of an owned queue row', async () => {
    conflict = true;
    tables.invoices[0].ksef_status = 'offline_queued';
    tables.ksef_offline_queue.push({
      id: 'existing-queue', tenant_id: 'tenant-a', invoice_id: 'invoice-a', ksef_environment: 'test', status: 'queued',
      idempotency_key: generateIdempotencyKey('tenant-a', 'invoice-a', new Date('2026-01-01T12:00:00Z')),
    });
    expect((await addToOfflineQueue(offlineParams)).id).toBe('existing-queue');
  });

  it('does not claim success from a dead idempotent queue row', async () => {
    conflict = true;
    tables.ksef_offline_queue.push({
      id: 'dead-queue', tenant_id: 'tenant-a', invoice_id: 'invoice-a',
      ksef_environment: 'test', status: 'failed',
      idempotency_key: generateIdempotencyKey('tenant-a', 'invoice-a', new Date('2026-01-01T12:00:00Z')),
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('requires reconciliation');
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });

  it('does not claim success when invoice ownership changes before the write', async () => {
    mocks.qr.mockImplementation(async () => {
      tables.invoices[0].tenant_id = 'tenant-b';
      return { offlinePayload: 'offline-fixture', certyfikatPayload: 'certificate-fixture' };
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Invoice could not be updated');
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });

  it('does not relabel an invoice accepted while Offline24 QR was prepared', async () => {
    mocks.qr.mockImplementation(async () => {
      tables.invoices[0].ksef_status = 'accepted';
      return { offlinePayload: 'offline-fixture', certyfikatPayload: 'certificate-fixture' };
    });
    await expect(addToOfflineQueue(offlineParams)).rejects.toThrow('Invoice could not be updated');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
  });
});
