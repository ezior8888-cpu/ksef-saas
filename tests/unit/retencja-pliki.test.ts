import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const s = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  r2Deleted: [] as string[],
  glacierDeleted: [] as string[],
  failR2: null as string | null,
  deletedInvoiceIds: [] as unknown[],
  audits: [] as Row[],
}));

vi.mock('@/lib/storage/r2-client', () => ({
  getR2Config: () => ({ bucketName: 'faktury' }),
  getR2Client: () => ({
    send: async (cmd: { input: { Key: string } }) => {
      if (s.failR2 && cmd.input.Key === s.failR2) throw new Error('R2 503');
      s.r2Deleted.push(cmd.input.Key);
    },
  }),
}));
vi.mock('@/lib/storage/glacier', () => ({
  deleteFromGlacier: async (key: string) => {
    s.glacierDeleted.push(key);
  },
}));
vi.mock('@/lib/audit/log-system', () => ({
  logAuditSystem: async (entry: Row) => {
    s.audits.push(entry);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const predicates: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'delete' = 'select';
      const q = {
        select: () => q,
        delete() { op = 'delete'; return q; },
        eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return q; },
        in(k: string, v: unknown[]) {
          if (op === 'delete' && table === 'invoices') s.deletedInvoiceIds.push(...v);
          predicates.push((r) => v.includes(r[k]));
          return q;
        },
        not: () => q,
        lt: () => q,
        limit: () => q,
        then(ok: (v: unknown) => unknown) {
          const data = (s.tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));
          return Promise.resolve({ data: op === 'delete' ? null : data, error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));

import { runRetentionDelete } from '@/lib/inngest/jobs/retention-delete';

/**
 * AUD-45: usunięcie faktury po retencji kasowało tylko wiersze. XML, UPO,
 * PDF, załączniki ponagleń w R2 i kopie w Glacier zostawały na zawsze —
 * a wiersz, który je wskazywał, znikał, więc nikt już ich nie znajdzie.
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

function faktura(id: string): Row {
  return {
    id,
    tenant_id: T,
    internal_number: id,
    xml_storage_path: `${T}/2016/01/${id}.xml`,
    pdf_storage_path: `${T}/2016/01/${id}.pdf`,
    archive_storage_path: `${T}/2016/01/${id}.xml`,
  };
}

beforeEach(() => {
  s.r2Deleted = [];
  s.glacierDeleted = [];
  s.failR2 = null;
  s.deletedInvoiceIds = [];
  s.audits = [];
  s.tables = {
    invoices: [faktura('inv-1'), faktura('inv-2')],
    xml_documents: [
      { invoice_id: 'inv-1', tenant_id: T, storage_provider: 'r2', storage_path: `${T}/2016/01/inv-1.xml` },
      { invoice_id: 'inv-1', tenant_id: T, storage_provider: 'r2', storage_path: `${T}/2016/01/inv-1.upo.xml` },
      { invoice_id: 'inv-1', tenant_id: T, storage_provider: 's3_glacier', storage_path: `${T}/2016/01/inv-1.v2.xml` },
    ],
    upo_receipts: [
      { invoice_id: 'inv-1', tenant_id: T, upo_xml_path: `upo/${T}/inv-1.xml`, upo_pdf_path: `upo/${T}/inv-1.pdf`, archive_glacier_key: null },
    ],
    payment_reminders: [{ invoice_id: 'inv-1', tenant_id: T, pdf_attachment_path: `reminders/${T}/inv-1/wezwanie.pdf` }],
  };
});

describe('retencja faktur — pliki znikają razem z wierszem (AUD-45)', () => {
  it('wszystkie pliki faktury w R2 i Glacier usunięte, potem wiersz', async () => {
    await runRetentionDelete(ctx);

    expect(s.r2Deleted).toEqual(expect.arrayContaining([
      `${T}/2016/01/inv-1.xml`,
      `${T}/2016/01/inv-1.pdf`,
      `${T}/2016/01/inv-1.upo.xml`,
      `upo/${T}/inv-1.xml`,
      `upo/${T}/inv-1.pdf`,
      `reminders/${T}/inv-1/wezwanie.pdf`,
    ]));
    expect(s.glacierDeleted).toEqual(expect.arrayContaining([
      `${T}/2016/01/inv-1.xml`,
      `${T}/2016/01/inv-1.v2.xml`,
    ]));
    // Ten sam klucz z dwóch kolumn — jedno usunięcie.
    expect(s.r2Deleted.filter((k) => k === `${T}/2016/01/inv-1.xml`)).toHaveLength(1);
    expect(s.deletedInvoiceIds).toEqual(expect.arrayContaining(['inv-1', 'inv-2']));
  });

  it('błąd magazynu przy jednej fakturze — jej wiersz zostaje do jutra, inne idą', async () => {
    s.failR2 = `${T}/2016/01/inv-1.pdf`;

    await runRetentionDelete(ctx);

    expect(s.deletedInvoiceIds).toEqual(['inv-2']);
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('klucz spoza katalogu firmy nie jest usuwany (dane wiersza są zapisywalne)', async () => {
    (s.tables.invoices![0] as Row).pdf_storage_path = `${OTHER}/2016/01/cudzy.pdf`;

    await runRetentionDelete(ctx);

    expect(s.r2Deleted).not.toContain(`${OTHER}/2016/01/cudzy.pdf`);
  });

  it('wpis audytu mówi, ile plików usunięto', async () => {
    await runRetentionDelete(ctx);

    const inv1 = s.audits.find((a) => a.entityId === 'inv-1');
    expect(inv1).toMatchObject({ metadata: expect.objectContaining({ filesDeleted: 8 }) });
  });
});
