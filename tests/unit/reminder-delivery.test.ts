import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderInvoiceSource } from '@/types/reminder-delivery';
const mocks = vi.hoisted(() => ({ client: vi.fn(), pdf: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.client }));
vi.mock('@/lib/reminders/pdf-demand-letter', () => ({ generateDemandLetterPdf: mocks.pdf }));
import { buildReminderDelivery } from '@/lib/reminders/prepare-delivery';
import { deliveryHtml, MAX_REMINDER_PDF_BYTES, reminderDeliverySchema, reminderInvoiceFingerprint } from '@/lib/reminders/delivery-schema';
import { DISCLAIMER } from '@/lib/flo/functions/payment-chase';
const tenantId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const invoiceFixture: ReminderInvoiceSource = {
  id: invoiceId, tenant_id: tenantId, gross_total: 123, paid_amount: 23, currency: 'PLN',
  payment_status: 'partial', direction: 'outgoing', ksef_status: 'accepted',
  payment_due_date: '2026-09-01', issue_date: '2026-08-20', internal_number: 'FV/1/2026', ksef_number: null,
  buyer_data: { name: 'Fixture buyer', email: 'buyer@example.test', address: { addressLine1: 'Test 1', addressLine2: '00-001 Miasto' } },
  buyer_nip: '1234567890', payment_data: { bankAccount: 'PL-fixture-bank' }, seller_data: { name: 'Fixture seller' }, reminders_paused: false,
};
let rows: Record<string, unknown>;
let failures: Set<string>;
let queries: Array<{ table: string; filters: Array<[string, unknown]> }>;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('RESEND_DEV_TO_OVERRIDE', ''); vi.stubEnv('RESEND_FROM_EMAIL', 'fallback@example.test');
  rows = {
    invoices: structuredClone(invoiceFixture),
    tenants: { id: tenantId, name: 'Fixture seller', nip: '1234567890', address_json: { addressLine1: 'Test 1', addressLine2: '00-001 Miasto' } },
    reminder_settings: { tenant_id: tenantId, sender_name: 'Fixture sender', sender_email: 'sender@example.test', reply_to_email: 'reply@example.test' },
    reminder_templates: null,
  };
  queries = []; failures = new Set();
  mocks.client.mockReturnValue({ from: (table: string) => {
    const call = { table, filters: [] as Array<[string, unknown]> }; queries.push(call);
    const query = { select: () => query, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: rows[table] ? structuredClone(rows[table]) : null, error: failures.has(table) ? { message: 'private-database-detail' } : null }),
    }; return query;
  } });
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-1.4\nfixture'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
// Deliberately accepts malformed database values to verify runtime rejection.
function patchInvoice(patch: Record<string, unknown>) { rows.invoices = { ...invoiceFixture, ...patch }; }

describe('read-only reminder preview preparation', () => {
  it('freezes the exact recipient, sender, plaintext and expiry with tenant-scoped reads', async () => {
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_1');
    expect(delivery).toMatchObject({ version: 1, tenantId, invoiceId, stage: 'stage_1',
      from: 'Fixture sender <sender@example.test>', to: 'buyer@example.test', replyTo: 'reply@example.test',
      preparedAt: '2026-09-23T12:00:00.000Z', expiresAt: '2026-09-23T12:30:00.000Z', daysOverdue: 22, attachment: null });
    expect(delivery.text).toContain(DISCLAIMER);
    expect(delivery.subject).toContain('FV/1/2026');
    expect(delivery.sourceFingerprint).toBe(reminderInvoiceFingerprint(invoiceFixture));
    expect(queries).toEqual([
      { table: 'invoices', filters: [['id', invoiceId], ['tenant_id', tenantId]] },
      { table: 'tenants', filters: [['id', tenantId]] },
      { table: 'reminder_settings', filters: [['tenant_id', tenantId]] },
      { table: 'reminder_templates', filters: [['tenant_id', tenantId], ['stage', 'stage_1'], ['is_default', false]] },
    ]);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses an explicitly previewed valid recipient and the configured sender fallback', async () => {
    rows.reminder_settings = null;
    expect(await buildReminderDelivery(tenantId, invoiceId, 'stage_2', 'chosen@example.test')).toMatchObject({
      to: 'chosen@example.test', from: 'Fixture seller <fallback@example.test>', replyTo: null,
    });
  });
  it('shows the actual development recipient and modified subject before consent', async () => {
    vi.stubEnv('RESEND_DEV_TO_OVERRIDE', 'preview@example.test');
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_1');
    expect(delivery.to).toBe('preview@example.test'); expect(delivery.subject).toContain('[DEV → buyer@example.test]');
  });
  it('blocks a development recipient override in production before database work', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('RESEND_DEV_TO_OVERRIDE', 'preview@example.test');
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_1')).rejects.toThrow('niedozwolone');
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(['invoices', 'tenants', 'reminder_settings', 'reminder_templates'])('does not hide a failed %s read behind defaults', async (table) => {
    failures.add(table);
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_1')).rejects.toThrow(/Nie udało się/);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it.each(['invoices', 'tenants', 'reminder_settings', 'reminder_templates'])('rejects a foreign %s row even if a broken query returned it', async (table) => {
    rows[table] = table === 'tenants' ? { ...(rows.tenants as object), id: otherId }
      : table === 'reminder_templates' ? { tenant_id: otherId, stage: 'stage_1', email_subject: 'Fixture', email_body: 'Fixture' }
      : { ...(rows[table] as object), tenant_id: otherId };
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_1')).rejects.toThrow();
  });
  it.each([
    { paid_amount: 123 }, { paid_amount: null }, { reminders_paused: true }, { gross_total: null }, { gross_total: NaN },
    { payment_status: 'paid' as const }, { direction: 'incoming' }, { ksef_status: 'rejected' },
    { currency: 'EUR' }, { payment_due_date: '2026-02-31' }, { payment_due_date: '2026-10-01' },
  ])('rejects unsafe or malformed source state %#', async (patch) => {
    patchInvoice(patch);
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_1')).rejects.toThrow();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it.each(['bad-address', 'one@example.test,two@example.test', 'one@example.test\r\nBcc: other@example.test'])('requires a single valid recipient %#', async (recipient) => {
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_1', recipient)).rejects.toThrow();
  });
  it('freezes custom text as plaintext, preserves dollar signs and appends the mandatory disclaimer once', async () => {
    rows.reminder_templates = { tenant_id: tenantId, stage: 'stage_1', email_subject: '{numerFaktury}', email_body: '<script>alert(1)</script> {nazwaKontrahenta}\n' + DISCLAIMER };
    patchInvoice({ internal_number: '$&', buyer_data: { name: '$& <img src=x>', email: 'buyer@example.test' } });
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_1');
    expect(delivery.subject).toBe('$&'); expect(delivery.text).toContain('$& <img src=x>');
    expect(delivery.text.split(DISCLAIMER)).toHaveLength(2);
    expect(deliveryHtml(delivery.text)).not.toContain('<script>');
    expect(deliveryHtml(delivery.text)).not.toContain('<img');
    expect(deliveryHtml(delivery.text)).toContain('&lt;script&gt;');
  });
  it.each(['stage_3', 'stage_4'] as const)('prepares the actual %s attachment before consent with frozen dates and figures', async (stage) => {
    const delivery = await buildReminderDelivery(tenantId, invoiceId, stage);
    expect(delivery.attachment).toEqual({ filename: 'Wezwanie-FV-1-2026.pdf', contentBase64: Buffer.from('%PDF-1.4\nfixture').toString('base64') });
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ amountDue: 100, letterDate: '2026-09-23', invoiceNumber: 'FV/1/2026', buyerName: 'Fixture buyer' }));
  });
  it('prepares a real PDF with the existing generator and no external requests', async () => {
    const actual = await vi.importActual<typeof import('@/lib/reminders/pdf-demand-letter')>('@/lib/reminders/pdf-demand-letter');
    mocks.pdf.mockImplementation(actual.generateDemandLetterPdf);
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_3');
    const bytes = Buffer.from(delivery.attachment!.contentBase64, 'base64');
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.length).toBeLessThanOrEqual(MAX_REMINDER_PDF_BYTES);
    expect(reminderDeliverySchema.safeParse(delivery).success).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects an oversized generated attachment before a delivery can be approved', async () => {
    mocks.pdf.mockResolvedValue(Buffer.alloc(MAX_REMINDER_PDF_BYTES + 1));
    await expect(buildReminderDelivery(tenantId, invoiceId, 'stage_3')).rejects.toThrow('limit');
  });
});

describe('strict immutable envelope and source fingerprint', () => {
  it('rejects unknown fields, header injection, malformed attachments and extended expiry', async () => {
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_1');
    for (const patch of [{ html: '<img>' }, { subject: 'Hello\r\nBcc: other@example.test' }, { expiresAt: '2026-09-23T12:31:00.000Z' },
      { expiresAt: '2026-09-23T12:00:00.000Z' }, { preparedAt: 'not-a-date' }, { from: 'sender@example.test' },
      { to: 'invalid' }, { attachment: { filename: '../invoice.pdf', contentBase64: 'bad' } }]) {
      expect(reminderDeliverySchema.safeParse({ ...delivery, ...patch }).success).toBe(false);
    }
  });
  it('accepts exactly 512 KiB and rejects larger or noncanonical attachment content', async () => {
    const delivery = await buildReminderDelivery(tenantId, invoiceId, 'stage_3');
    const content = Buffer.alloc(MAX_REMINDER_PDF_BYTES, 65);
    content.write('%PDF-1.4');
    const envelope = (contentBase64: string) => ({ ...delivery, attachment: { filename: 'invoice.pdf', contentBase64 } });
    expect(reminderDeliverySchema.safeParse(envelope(content.toString('base64'))).success).toBe(true);
    const tooLarge = Buffer.concat([content, Buffer.from('x')]);
    for (const value of [tooLarge.toString('base64'), content.toString('base64') + '=', '%PDF-invalid', Buffer.from('not-pdf').toString('base64')]) {
      expect(reminderDeliverySchema.safeParse(envelope(value)).success).toBe(false);
    }
  });
  it('escapes all HTML metacharacters and only supplies safe line breaks', () => {
    expect(deliveryHtml('&<>"\'\nnext')).toBe('<p>&amp;&lt;&gt;&quot;&#39;<br>next</p>');
  });
  it('ignores nested JSON key order but binds finance, recipient, bank account and invoice identity', () => {
    const original = reminderInvoiceFingerprint(invoiceFixture);
    expect(reminderInvoiceFingerprint({ ...invoiceFixture, buyer_data: { email: 'buyer@example.test', address: { addressLine2: '00-001 Miasto', addressLine1: 'Test 1' }, name: 'Fixture buyer' } })).toBe(original);
    for (const patch of [{ gross_total: 124 }, { paid_amount: 24 }, { tenant_id: otherId }, { id: otherId },
      { buyer_data: { name: 'Fixture buyer', email: 'different@example.test' } }, { payment_data: { bankAccount: 'different' } },
      { internal_number: 'FV/2/2026' }, { reminders_paused: true }, { currency: 'EUR' }]) {
      expect(reminderInvoiceFingerprint({ ...invoiceFixture, ...patch })).not.toBe(original);
    }
  });
});
