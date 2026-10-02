import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  format: 'kpir_excel',
  updates: [] as Array<Record<string, unknown>>,
  uploaded: vi.fn(async () => undefined),
  kpir: vi.fn(async () => Buffer.from('expense-only-kpir')),
  jpkV7m: vi.fn(() => '<JPK/>'),
  fetch: vi.fn(async () => ({
    issuer: { nip: '1234567890', name: 'A', address: '' },
    issuedInvoices: [], receivedInvoices: [], expenses: [{ id: 'manual-expense' }],
  })),
}));

vi.mock('@/lib/inngest/client', () => ({
  exportsGenerateRequested: {},
  inngest: { createFunction: vi.fn(() => ({})) },
}));
vi.mock('@/lib/exports/data-fetcher', () => ({
  fetchInvoicesForExport: mocks.fetch,
}));
vi.mock('@/lib/exports/kpir-generator', () => ({ generateKpirXlsx: mocks.kpir }));
vi.mock('@/lib/exports/tax-office', async (original) => ({
  ...(await original<typeof import('@/lib/exports/tax-office')>()),
  readTenantTaxOffice: async () => '1433',
}));
vi.mock('@/lib/exports/taxpayer-email', () => ({ readTaxpayerEmail: async () => 'owner@example.test' }));
vi.mock('@/lib/exports/jpk-v7m-generator', async (original) => ({
  ...(await original<typeof import('@/lib/exports/jpk-v7m-generator')>()),
  generateJpkV7m: mocks.jpkV7m,
}));
vi.mock('@/lib/storage/r2', () => ({
  uploadToR2IfAbsent: async () => {
    await mocks.uploaded();
    return true;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({
          data: table === 'export_jobs' ? {
            id: 'job-1', tenant_id: 'tenant-a', format: mocks.format,
            period_start: '2026-01-01', period_end: '2026-01-31',
            include_issued: true, include_received: false, include_corrections: true,
          } : null,
          error: null,
        }),
        update: (value: Record<string, unknown>) => {
          mocks.updates.push(value);
          return query;
        },
        upsert: () => query,
        then: <T,>(resolve: (result: { error: null }) => T) =>
          Promise.resolve({ error: null as null }).then(resolve),
      };
      return query;
    },
  }),
}));

import { runExportsGenerate } from '@/lib/inngest/jobs/exports-generate';

const context: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: {
    run: async (_name, work) => work(),
    sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.format = 'kpir_excel';
  mocks.updates = [];
});

describe('exports with costs but no accepted invoices', () => {
  // JPK_V7M jest w main wstrzymany (#66, I4) — z samych kosztów sprawdzamy KPiR.
  it.each(['kpir_excel'])('generates the %s file from expenses', async format => {
    mocks.format = format;
    await expect(runExportsGenerate({ exportJobId: 'job-1' }, context))
      .resolves.toMatchObject({ success: true });
    expect(mocks.fetch).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'issued', includeExpenses: true,
    }));
    expect(mocks.uploaded).toHaveBeenCalledOnce();
    expect(mocks.updates.some((update) => update.status === 'completed' &&
      update.progress_message === 'Gotowe')).toBe(true);
    expect(mocks.updates.some((update) => update.progress_message === 'Brak faktur w wybranym okresie')).toBe(false);
  });

  it('keeps invoice-only JPK FA empty when only expenses exist', async () => {
    mocks.format = 'jpk_fa';
    await expect(runExportsGenerate({ exportJobId: 'job-1' }, context))
      .resolves.toMatchObject({ count: 0 });
    expect(mocks.uploaded).not.toHaveBeenCalled();
  });
});
