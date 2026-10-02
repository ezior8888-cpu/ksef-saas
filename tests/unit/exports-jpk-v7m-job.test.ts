import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { ExportExpense } from '@/lib/exports/data-fetcher';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';

const db = vi.hoisted(() => ({
  office: '1433' as string | null,
  owner: 'u-1' as string | null,
  email: 'wlasciciel@example.test' as string | null,
  uploads: [] as string[],
  invoiceLookupError: null as { message: string } | null,
}));

function builder(table: string) {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    in: () => q,
    limit: () => q,
    update: () => q,
    upsert: () => q,
    single: async () => ({
      data: {
        id: 'job-1',
        tenant_id: 'ten-1',
        format: 'jpk_v7m',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        include_issued: true,
        include_received: true,
        include_corrections: true,
        status: 'pending',
      },
      error: null,
    }),
    maybeSingle: async () => {
      if (table === 'tenants') return { data: { tax_office_code: db.office }, error: null };
      if (table === 'memberships') return { data: db.owner ? { user_id: db.owner } : null, error: null };
      return { data: null, error: null };
    },
    then: (ok: (v: unknown) => unknown) =>
      Promise.resolve(
        table === 'invoices'
          ? { data: [{ id: 'inv-9', ksef_number: '5252241585-20260806-0100001AF629-B0' }], error: db.invoiceLookupError }
          : { error: null },
      ).then(ok),
  });
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: builder,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: db.email } }, error: null }) } },
  }),
}));
vi.mock('@/lib/storage/r2', () => ({
  r2ObjectExists: async () => false,
  uploadToR2IfAbsent: async (_p: string, buffer: Buffer) => {
    db.uploads.push(buffer.toString('utf8'));
    return true;
  },
  uploadToR2: async (_p: string, buffer: Buffer) => {
    db.uploads.push(buffer.toString('utf8'));
  },
}));
// Ścieżka „na potem”: JPK_V7M jest wstrzymany (#66), a od 29.09 job odmawia
// wstrzymanych formatów. Tu udajemy odblokowanie, żeby sprawdzić sam plik;
// odmowę sprawdza osobny test na końcu.
const wstrzymanie = vi.hoisted(() => ({ aktywne: false }));
vi.mock('@/lib/exports/suspended-formats', async (orig) => {
  const prawdziwe = await orig<typeof import('@/lib/exports/suspended-formats')>();
  return { ...prawdziwe, isExportFormatSuspended: (f: string) => wstrzymanie.aktywne && prawdziwe.isExportFormatSuspended(f) };
});
vi.mock('@/lib/exports/data-fetcher', async (orig) => ({
  ...(await orig<typeof import('@/lib/exports/data-fetcher')>()),
  fetchInvoicesForExport: async () => ({
    issuer: { nip: '5260001246', name: 'Moja Firma' },
    issuedInvoices: [
      {
        invoiceNumber: 'FS/1/08',
        currency: 'PLN',
        invoiceType: 'regular',
        issueDate: '2026-08-05',
        buyerName: 'Klient',
        buyerNip: '5252241585',
        netTotal: 1000,
        vatTotal: 230,
        grossTotal: 1230,
        ksefNumber: '5260001246-20260805-0100001AF629-AF',
        lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 1000, netAmount: 1000, vatRate: '23' }],
      } as JpkInvoice,
    ],
    receivedInvoices: [],
    expenses: [],
  }),
}));

import { attachKsefNumbers } from '@/lib/exports/data-fetcher';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';
import { readTaxpayerEmail } from '@/lib/exports/taxpayer-email';
import { runExportsGenerate } from '@/lib/jobs/runners/exports-generate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * JPK_V7M(3) w jobie eksportu: urząd i e-mail podatnika trafiają do OBU
 * generowań, plik wysłany do R2 przechodzi oficjalny XSD. Eksport JPK_V7M
 * jest wstrzymany (#66) do przeglądu przez księgową — to ścieżka na potem.
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  db.office = '1433';
  db.owner = 'u-1';
  db.email = 'wlasciciel@example.test';
  db.uploads = [];
  db.invoiceLookupError = null;
});

describe('job eksportu JPK_V7M(3)', () => {
  it('plik wysłany do R2 przechodzi oficjalny XSD, z urzędem i e-mailem', async () => {
    await runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    expect(db.uploads).toHaveLength(1);
    const xml = db.uploads[0]!;
    expect(xml).toContain('<KodUrzedu>1433</KodUrzedu>');
    expect(xml).toContain('<Email>wlasciciel@example.test</Email>');
    expect((await validateJpkV7m(xml)).errors).toEqual([]);
  });

  it('bez e-maila właściciela: koniec bez ponawiania, z komunikatem', async () => {
    db.email = null;
    const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
    await expect(run).rejects.toThrow(/e-mail podatnika/);
    expect(db.uploads).toEqual([]);
  });

  it('bez urzędu: koniec bez ponawiania', async () => {
    db.office = null;
    await expect(runExportsGenerate({ exportJobId: 'job-1' }, ctx)).rejects.toMatchObject({ name: 'NonRetriableError' });
  });

  it('DZIŚ (wstrzymany): zlecenie JPK_V7M kończy się bez pliku, z powodem', async () => {
    wstrzymanie.aktywne = true;
    try {
      const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
      await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
      await expect(run).rejects.toThrow(/JPK_V7M jest chwilowo wyłączony/);
      expect(db.uploads).toEqual([]);
    } finally {
      wstrzymanie.aktywne = false;
    }
  });
});

describe('e-mail podatnika = właściciel firmy', () => {
  it('jest właściciel — jego adres', async () => {
    await expect(readTaxpayerEmail(createAdminClient() as never, 'ten-1')).resolves.toBe('wlasciciel@example.test');
  });
  it('brak właściciela — null', async () => {
    db.owner = null;
    await expect(readTaxpayerEmail(createAdminClient() as never, 'ten-1')).resolves.toBeNull();
  });
});

describe('numer KSeF kosztu ze skrzynki (NrKSeF w wierszu zakupu)', () => {
  const koszt = (id: string): ExportExpense => ({
    id,
    issueDate: '2026-08-06',
    documentNumber: 'FZ/1',
    documentType: 'invoice',
    sellerName: 'Dostawca',
    sellerNip: '5252241585',
    sellerAddress: null,
    netAmount: 100,
    vatAmount: 23,
    grossAmount: 123,
    vatDeductibleAmount: 23,
    kpirColumn: 'col_13',
    categoryLabel: null,
  });

  it('koszt powiązany z fakturą dostaje jej numer, reszta null', async () => {
    const expenses = [koszt('exp-ksef'), koszt('exp-papier')];
    await attachKsefNumbers(createAdminClient() as never, 'ten-1', expenses, new Map([['exp-ksef', 'inv-9']]));
    expect(expenses.map((e) => e.ksefNumber)).toEqual(['5252241585-20260806-0100001AF629-B0', null]);
  });

  it('błąd odczytu numerów rzuca — to nie „brak numeru” (plik dostałby BFK)', async () => {
    db.invoiceLookupError = { message: 'timeout' };
    await expect(
      attachKsefNumbers(createAdminClient() as never, 'ten-1', [koszt('exp-ksef')], new Map([['exp-ksef', 'inv-9']])),
    ).rejects.toThrow(/timeout/);
  });
});
