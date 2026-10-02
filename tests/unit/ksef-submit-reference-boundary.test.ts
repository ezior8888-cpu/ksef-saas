import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice } from '@/types/invoice';
import type { CorrectionInvoiceData, AdvanceInvoiceData, FinalInvoiceData } from '@/types/invoice-types';
import { assertSubmitReferences } from '@/lib/ksef/submit-reference-boundary';

const tenantId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const parentId = '33333333-3333-4333-8333-333333333333';
const nip = '1234567890';
const correction = {
  invoiceType: 'correction', internalNumber: 'KOR/1', parentInvoiceId: parentId,
  parentInvoiceNumber: 'VAT/1', parentInvoiceIssueDate: '2026-09-01',
  parentKsefNumber: 'KSEF-PROD-1', seller: { nip },
} as CorrectionInvoiceData;
const advance = { invoiceType: 'advance', internalNumber: 'ZAL/1' } as AdvanceInvoiceData;
const final = { invoiceType: 'final', internalNumber: 'ROZ/1', advanceInvoiceIds: [parentId] } as FinalInvoiceData;

type Row = Record<string, unknown>;
let invoice: Row;
let eventInvoice: Invoice;
let parent: Row;
let readError: string | null;
let reads: Array<{ table: string; filters: Record<string, unknown> }>;

function from(table: string) {
  const record = { table, filters: {} as Record<string, unknown> };
  reads.push(record);
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { record.filters[key] = value; return chain; },
    maybeSingle: async () => {
      if (readError === table) return { data: null, error: { message: 'temporary-db-error' } };
      const row = table === 'invoices' && reads.length === 1 ? invoice : parent;
      const match = Object.entries(record.filters).every(([key, value]) => row[key] === value);
      return { data: match ? row : null, error: null };
    },
  };
  return chain;
}
const supabase = { from } as unknown as SupabaseClient;

beforeEach(() => {
  reads = [];
  readError = null;
  invoice = {
    id: invoiceId, tenant_id: tenantId, invoice_kind: 'correction',
    internal_number: 'KOR/1', parent_invoice_id: parentId, advance_invoice_ids: [],
  };
  setDocument('KOR/1', 'KOR');
  parent = {
    id: parentId, tenant_id: tenantId, direction: 'outgoing', invoice_kind: 'regular',
    ksef_status: 'accepted', ksef_environment: 'test', internal_number: 'VAT/1',
    issue_date: '2026-09-01', ksef_number: 'KSEF-PROD-1', seller_nip: nip,
  };
});

function setDocument(internalNumber: string, type: Invoice['type']) {
  eventInvoice = { internalNumber, type } as Invoice;
  invoice.internal_number = internalNumber;
  invoice.invoice_type = type;
  invoice.fa3_data = { internalNumber, type };
}

const input = () => ({
  supabase, tenantId, invoiceId, invoice: eventInvoice, environment: 'test' as const,
  correctionData: correction,
});

describe('KSeF submit reference boundary', () => {
  it('allows a matching correction only after reading the stored parent in the current environment', async () => {
    await expect(assertSubmitReferences(input())).resolves.toBe('correction');
    expect(reads).toHaveLength(2);
    expect(reads[1]?.filters).toMatchObject({
      id: parentId, tenant_id: tenantId, ksef_status: 'accepted',
      ksef_environment: 'test', invoice_kind: 'regular', direction: 'outgoing',
    });
  });

  it.each([
    ['foreign parent', { tenant_id: '44444444-4444-4444-8444-444444444444' }],
    ['PROD parent', { ksef_environment: 'production' }],
    ['legacy parent', { ksef_environment: null }],
    ['not accepted', { ksef_status: 'draft' }],
    ['missing KSeF number', { ksef_number: null }],
  ])('blocks a %s before KSeF I/O', async (_label, patch) => {
    parent = { ...parent, ...patch };
    await expect(assertSubmitReferences(input())).rejects.toThrow('manual reconciliation');
  });

  it('blocks an Offline24 replay that lost correction data', async () => {
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined }))
      .rejects.toThrow('manual reconciliation');
    expect(reads).toHaveLength(1);
  });

  it('holds correction submission in PROD pending original XML and correction-chain proof', async () => {
    await expect(assertSubmitReferences({ ...input(), environment: 'production' }))
      .rejects.toThrow('manual reconciliation');
    expect(reads).toHaveLength(1);
  });

  it('blocks a changed correction parent and forged metadata', async () => {
    invoice.parent_invoice_id = '55555555-5555-4555-8555-555555555555';
    await expect(assertSubmitReferences(input())).rejects.toThrow('manual reconciliation');
    invoice.parent_invoice_id = parentId;
    reads = [];
    await expect(assertSubmitReferences({
      ...input(), correctionData: { ...correction, parentInvoiceNumber: 'FORGED' },
    })).rejects.toThrow('manual reconciliation');
  });

  it('keeps ordinary VAT payloads and rejects subtype data on a regular invoice', async () => {
    invoice.invoice_kind = 'regular';
    setDocument('VAT/1', 'VAT');
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined })).resolves.toBe('regular');
    reads = [];
    await expect(assertSubmitReferences(input())).rejects.toThrow('manual reconciliation');
  });

  it('blocks incomplete advance and final payloads instead of falling back to VAT XML', async () => {
    invoice.invoice_kind = 'advance';
    setDocument('ZAL/1', 'ZAL');
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined }))
      .rejects.toThrow('manual reconciliation');
    reads = [];
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined, advanceData: advance }))
      .resolves.toBe('advance');
    invoice.invoice_kind = 'final';
    setDocument('ROZ/1', 'ROZ');
    invoice.advance_invoice_ids = [parentId];
    reads = [];
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined }))
      .rejects.toThrow('manual reconciliation');
    reads = [];
    await expect(assertSubmitReferences({
      ...input(), environment: 'production', correctionData: undefined,
      finalData: final, finalAdvanceSettlementRows: [{}],
    })).rejects.toThrow('manual reconciliation');
    reads = [];
    await expect(assertSubmitReferences({
      ...input(), environment: 'test', correctionData: undefined,
      finalData: final, finalAdvanceSettlementRows: [{}],
    })).resolves.toBe('final');
    invoice.advance_invoice_ids = ['different'];
    reads = [];
    await expect(assertSubmitReferences({
      ...input(), environment: 'test', correctionData: undefined,
      finalData: final, finalAdvanceSettlementRows: [{}],
    })).rejects.toThrow('manual reconciliation');
  });

  it('treats a database read failure as retryable rather than a forged document', async () => {
    readError = 'invoices';
    await expect(assertSubmitReferences(input())).rejects.toThrow('Cannot read KSeF invoice kind');
  });

  it('blocks a stale event after the stored legal content changes before sending', async () => {
    invoice.invoice_kind = 'regular';
    setDocument('VAT/1', 'VAT');
    invoice.fa3_data = { internalNumber: 'VAT/1', type: 'VAT', grossTotal: 200 };
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined }))
      .rejects.toThrow('manual reconciliation');
    expect(reads).toHaveLength(1);
  });

  it('blocks a mismatched stored subtype even if the JSON matches', async () => {
    invoice.invoice_kind = 'regular';
    setDocument('VAT/1', 'VAT');
    invoice.invoice_type = 'KOR';
    await expect(assertSubmitReferences({ ...input(), correctionData: undefined }))
      .rejects.toThrow('manual reconciliation');
  });
});
