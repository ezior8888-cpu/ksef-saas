import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({ getPageContext: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.getPageContext }));
vi.mock('@/components/expenses/kpir-view', () => ({
  KpirView: ({ invoices, expenses }: {
    invoices: Array<{ internal_number: string }>;
    expenses: Array<{ id: string }>;
  }) => [
    ...invoices.map((invoice) => invoice.internal_number),
    ...expenses.map((expense) => expense.id),
  ].join(','),
}));

import KpirPage from '@/app/(dashboard)/reports/kpir/page';

type Row = Record<string, unknown>;
const fixtureRows: Row[] = [
  { id: 'test', tenant_id: 'tenant-a', internal_number: 'TEST-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: 'test', issue_date: '2026-09-10' },
  { id: 'prod', tenant_id: 'tenant-a', internal_number: 'PROD-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: 'production', issue_date: '2026-09-10' },
  { id: 'legacy', tenant_id: 'tenant-a', internal_number: 'LEGACY-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: null, issue_date: '2026-09-10' },
];
let rows: Row[];
let expenseRows: Row[];
const from = vi.fn((table: string) => {
  let head = false;
  let count = false;
  const filters: Array<(row: Row) => boolean> = [];
  const query = {
    select: (_columns: string, options?: { count?: string; head?: boolean }) => { count = !!options?.count; head = !!options?.head; return query; },
    eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
    or: (filter: string) => {
      const match = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(filter);
      if (!match) throw new Error(`Unexpected OR filter ${filter}`);
      filters.push((row) => row.ksef_environment == null || row.ksef_environment !== match[1]);
      return query;
    },
    gte: (key: string, value: string) => { filters.push((row) => String(row[key]) >= value); return query; },
    lte: (key: string, value: string) => { filters.push((row) => String(row[key]) <= value); return query; },
    order: () => query,
    then: <T,>(resolve: (value: { data: Row[] | null; count: number | null; error: null }) => T) => {
      const selected = (table === 'invoices' ? rows : expenseRows).filter((row) => filters.every((filter) => filter(row)));
      return Promise.resolve({ data: head ? null : selected, count: count ? selected.length : null, error: null as null }).then(resolve);
    },
  };
  return query;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  rows = fixtureRows.map((row) => ({ ...row }));
  expenseRows = [];
  mocks.getPageContext.mockResolvedValue({ tenantId: 'tenant-a', supabase: { from } });
});
afterEach(() => vi.unstubAllEnvs());

describe('KPiR KSeF provenance', () => {
  it('renders accepted invoices only after a clean provenance preflight', async () => {
    rows = [rows[0]!];
    const page = await KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('TEST-DOCUMENT');
    expect(html).not.toContain('PROD-DOCUMENT');
    expect(html).not.toContain('LEGACY-DOCUMENT');
  });

  it('blocks KPiR when the period contains another environment or historical NULL', async () => {
    await expect(KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) }))
      .rejects.toThrow('require KSeF environment reconciliation');
    expect(from).toHaveBeenCalledExactlyOnceWith('invoices');
  });

  it('rejects an unset environment before reading accounting rows', async () => {
    vi.stubEnv('KSEF_ENV', '');
    await expect(KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) }))
      .rejects.toThrow('not safely configured');
    expect(from).not.toHaveBeenCalled();
  });

  it('shows manual/OCR costs and matching inbox costs, excluding a linked PROD cost', async () => {
    rows = [
      rows[0]!,
      { id: 'test-source', tenant_id: 'tenant-a', direction: 'incoming', ksef_status: 'accepted', ksef_environment: 'test', issue_date: '2026-08-10' },
      { id: 'prod-source', tenant_id: 'tenant-a', direction: 'incoming', ksef_status: 'accepted', ksef_environment: 'production', issue_date: '2026-08-10' },
    ];
    expenseRows = [
      { id: 'manual', tenant_id: 'tenant-a', source: 'manual', ksef_invoice_id: null, is_deductible: true, issue_date: '2026-09-10' },
      { id: 'ocr-cost', tenant_id: 'tenant-a', source: 'ocr_photo', ksef_invoice_id: null, is_deductible: true, issue_date: '2026-09-10' },
      { id: 'test-cost', tenant_id: 'tenant-a', source: 'ksef_inbox', ksef_invoice_id: 'test-source', is_deductible: true, issue_date: '2026-09-10' },
      { id: 'prod-cost', tenant_id: 'tenant-a', source: 'ksef_inbox', ksef_invoice_id: 'prod-source', is_deductible: true, issue_date: '2026-09-10' },
    ];

    const page = await KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('manual');
    expect(html).toContain('ocr-cost');
    expect(html).toContain('test-cost');
    expect(html).not.toContain('prod-cost');
  });

  it('blocks a KSeF cost without its linked invoice', async () => {
    rows = [rows[0]!];
    expenseRows = [{
      id: 'unlinked', tenant_id: 'tenant-a', source: 'ksef_inbox',
      ksef_invoice_id: null, is_deductible: true, issue_date: '2026-09-10',
    }];
    await expect(KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) }))
      .rejects.toThrow('no linked invoice');
  });

  it('blocks a cost with NULL provenance instead of treating it as manual', async () => {
    rows = [rows[0]!];
    expenseRows = [{
      id: 'unknown-source', tenant_id: 'tenant-a', source: null,
      ksef_invoice_id: null, is_deductible: true, issue_date: '2026-09-10',
    }];
    await expect(KpirPage({ searchParams: Promise.resolve({ month: '9', year: '2026' }) }))
      .rejects.toThrow('provenance is malformed');
  });
});
