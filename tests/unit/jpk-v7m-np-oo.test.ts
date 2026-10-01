import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ updates: [] as Row[], uploads: 0 }));

/** Atrapa bazy dla joba: zlecenie JPK_V7M, urząd i właściciel firmy; zapisuje zmiany statusu. */
function builder(table: string) {
  let patch: Row | null = null;
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    in: () => q,
    limit: () => q,
    upsert: () => q,
    update: (p: Row) => ((patch = p), q),
    single: async () => ({
      data: { id: 'job-1', tenant_id: 'ten-1', format: 'jpk_v7m', period_start: '2026-09-01', period_end: '2026-09-30', include_issued: true, include_received: true, include_corrections: true, status: 'pending' },
      error: null,
    }),
    maybeSingle: async () => {
      if (table === 'tenants') return { data: { tax_office_code: '1433' }, error: null };
      if (table === 'memberships') return { data: { user_id: 'u-1' }, error: null };
      return { data: null, error: null };
    },
    then: (ok: (v: { error: null }) => unknown) => {
      if (patch) db.updates.push(patch);
      return Promise.resolve({ error: null }).then(ok);
    },
  });
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: builder,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'wlasciciel@example.test' } }, error: null }) } },
  }),
}));
vi.mock('@/lib/storage/r2', () => ({
  r2ObjectExists: async () => false,
  uploadToR2: async () => {
    db.uploads += 1;
  },
}));
// JPK_V7M jest wstrzymany (#66) — tu udajemy odblokowanie, żeby dojść do generatora.
vi.mock('@/lib/exports/suspended-formats', async (orig) => ({
  ...(await orig<typeof import('@/lib/exports/suspended-formats')>()),
  isExportFormatSuspended: () => false,
}));
vi.mock('@/lib/exports/data-fetcher', async (orig) => ({
  ...(await orig<typeof import('@/lib/exports/data-fetcher')>()),
  fetchInvoicesForExport: async () => ({
    issuer: { nip: '5260001246', name: 'Moja Firma' },
    issuedInvoices: [
      faktura({ invoiceNumber: 'FV/3/09', netTotal: 800, vatTotal: 0, grossTotal: 800, lines: [linia(800, 'oo')] }),
    ],
    receivedInvoices: [],
    expenses: [],
  }),
}));

import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import {
  generateJpkV7m,
  JpkV7mReverseChargeNotSupportedError,
  summarizeJpkV7m,
  type JpkV7mInputData,
} from '@/lib/exports/jpk-v7m-generator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';
import { onExportsGenerateExhausted, runExportsGenerate } from '@/lib/inngest/jobs/exports-generate';

/**
 * Stawki „np” i „oo” w JPK_V7M. Do 01.10.2026 obie po cichu wypadały
 * z pliku: faktura była w KSeF, a w ewidencji VAT jej nie było.
 * - „np” = FA(3) P_13_8 (poza terytorium kraju, bez art. 100 ust. 1 pkt 4)
 *   → K_11 w wierszu i P_11 w deklaracji, wliczane do P_37.
 * - „oo” = FA(3) P_13_10. W JPK_V7M(3) K_31/P_31 to podstawa NABYWCY
 *   (art. 17 ust. 1 pkt 5) — pole sprzedawcy do ustalenia z księgową,
 *   więc odmowa zamiast pliku bez tej sprzedaży.
 */

function linia(netAmount: number, vatRate: string) {
  return { position: 1, name: 'x', unit: 'szt.', quantity: 1, unitPriceNet: netAmount, netAmount, vatRate };
}

function faktura(o: Partial<JpkInvoice>): JpkInvoice {
  return {
    invoiceNumber: 'FV/1/09',
    currency: 'PLN',
    invoiceType: 'regular',
    issueDate: '2026-09-10',
    buyerName: 'Klient',
    buyerNip: '5252241585',
    netTotal: 1000,
    vatTotal: 230,
    grossTotal: 1230,
    ksefNumber: '5260001246-20260910-0100001AF629-AF',
    lines: [linia(1000, '23')],
    ...o,
  };
}

function dane(issuedInvoices: JpkInvoice[]): JpkV7mInputData {
  return {
    issuer: { nip: '5260001246', name: 'Moja Firma', email: 'biuro@example.test', taxOfficeCode: '1433' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    generatedAt: new Date('2026-10-01T10:00:00Z'),
    issuedInvoices,
  };
}

const np = faktura({ invoiceNumber: 'FV/2/09', buyerNip: undefined, buyerName: 'Client GmbH', netTotal: 500.4, vatTotal: 0, grossTotal: 500.4, lines: [linia(500.4, 'np')] });

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  db.updates = [];
  db.uploads = 0;
});

describe('JPK_V7M: sprzedaż poza krajem („np”)', () => {
  it('wiersz ma K_11, deklaracja P_11 i P_37 z nią', () => {
    const xml = generateJpkV7m(dane([faktura({}), np]));
    expect(xml).toContain('<K_11>500.40</K_11>');
    expect(xml).toContain('<P_11>500</P_11>');
    expect(xml).toContain('<P_37>1500</P_37>');
    // Bez podatku należnego — P_38 tylko z 23%.
    expect(xml).toContain('<P_38>230</P_38>');
  });

  it('plik z „np” przechodzi XSD', async () => {
    expect((await validateJpkV7m(generateJpkV7m(dane([faktura({}), np])))).errors).toEqual([]);
  });
});

describe('JPK_V7M: odwrotne obciążenie („oo”) — odmowa', () => {
  const oo = faktura({ invoiceNumber: 'FV/3/09', netTotal: 800, vatTotal: 0, grossTotal: 800, lines: [linia(800, 'oo')] });

  it('plik nie powstaje — także podsumowanie dla FLO', () => {
    expect(() => generateJpkV7m(dane([faktura({}), oo]))).toThrow(JpkV7mReverseChargeNotSupportedError);
    expect(() => summarizeJpkV7m(dane([oo]))).toThrow(JpkV7mReverseChargeNotSupportedError);
  });

  it('job: koniec bez pliku i bez ponawiania — ponowienie dałoby ten sam wynik', async () => {
    const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
    await expect(run).rejects.toThrow(/odwrotnym obciążeniem/);
    expect(db.uploads).toBe(0);
  });

  it('po wyczerpaniu prób klient widzi powód, nie ogólny błąd', async () => {
    const powod = new JpkV7mReverseChargeNotSupportedError().message;
    await onExportsGenerateExhausted(new Error(powod), { exportJobId: 'job-1' });
    expect(db.updates[0]).toMatchObject({ status: 'failed', error_message: powod });
  });
});
