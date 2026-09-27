import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({ getPageContext: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.getPageContext }));
vi.mock('@/components/expenses/kpir-view', () => ({
  KpirView: ({ invoices }: { invoices: Array<{ internal_number: string }> }) =>
    invoices.map((invoice) => invoice.internal_number).join(','),
}));

import KpirPage from '@/app/(dashboard)/reports/kpir/page';

type Row = Record<string, unknown>;
const fixtureRows: Row[] = [
  { id: 'test', tenant_id: 'tenant-a', internal_number: 'TEST-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: 'test', issue_date: '2026-09-10' },
  { id: 'prod', tenant_id: 'tenant-a', internal_number: 'PROD-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: 'production', issue_date: '2026-09-10' },
  { id: 'legacy', tenant_id: 'tenant-a', internal_number: 'LEGACY-DOCUMENT', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: null, issue_date: '2026-09-10' },
];
let rows: Row[];
const from = vi.fn((table: string) => {
  let head = false;
  let count = false;
  const filters: Array<(row: Row) => boolean> = [];
  const query = {
    select: (_columns: string, options?: { count?: string; head?: boolean }) => { count = !!options?.count; head = !!options?.head; return query; },
    eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
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
      const selected = (table === 'invoices' ? rows : []).filter((row) => filters.every((filter) => filter(row)));
      return Promise.resolve({ data: head ? null : selected, count: count ? selected.length : null, error: null as null }).then(resolve);
    },
  };
  return query;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  rows = fixtureRows.map((row) => ({ ...row }));
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
});
