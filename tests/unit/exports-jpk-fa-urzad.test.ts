import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  office: null as string | null,
  updates: [] as Array<{ table: string; patch: Row; statusIn?: unknown[] }>,
  uploads: [] as string[],
  orderedFormats: [] as string[],
  /** Liczba korekt w okresie (zapytanie `jpkFaBlocker`). */
  corrections: 0,
  /** Adres z GUS — `null` = GUS nie zna firmy. */
  gusKnowsCompany: true,
  /** GUS chwilowo nie odpowiada. */
  gusDown: false,
}));

/** Atrapa klienta: zlecenie eksportu, urząd firmy, zapis pliku. */
function builder(table: string) {
  let patch: Row | null = null;
  let statusIn: unknown[] | undefined;
  let inserted = false;
  let counting = false;
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: (_cols?: string, opts?: { count?: string }) => ((counting = !!opts?.count), q),
    eq: () => q,
    gte: () => q,
    lte: () => q,
    in: (col: string, vals: unknown[]) => {
      if (col === 'status') statusIn = vals;
      return q;
    },
    update: (p: Row) => ((patch = p), q),
    upsert: () => q,
    insert: (r: Row) => {
      inserted = true;
      db.orderedFormats.push(String(r.format));
      return q;
    },
    single: async () => inserted ? { data: { id: `job-${db.orderedFormats.length}` }, error: null } : ({
      data: {
        id: 'job-1',
        tenant_id: 'ten-1',
        format: 'jpk_fa',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        include_issued: true,
        include_received: false,
        include_corrections: true,
        status: 'pending',
      },
      error: null,
    }),
    maybeSingle: async () =>
      table === 'tenants'
        ? { data: { tax_office_code: db.office, nip: '5260001246' }, error: null }
        : { data: null, error: null },
    then: (ok: (v: { error: null; count?: number }) => unknown) => {
      if (patch) db.updates.push({ table, patch, statusIn });
      if (counting && table === 'invoices') return Promise.resolve({ error: null, count: db.corrections }).then(ok);
      return Promise.resolve({ error: null }).then(ok);
    },
  });
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock('@/lib/storage/r2', () => ({
  uploadToR2IfAbsent: async (_path: string, buffer: Buffer) => {
    db.uploads.push(buffer.toString('utf8'));
    return true;
  },
}));
// Adres z GUS bez sieci — test jednostkowy nie może dzwonić do BIR.
vi.mock('@/lib/exports/issuer-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/exports/issuer-address')>()),
  readIssuerRegisteredAddress: async () => {
    if (db.gusDown) throw new Error('GUS: timeout');
    return db.gusKnowsCompany
      ? {
          voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', street: 'ul. Puławska',
          buildingNumber: '12', city: 'Warszawa', postCode: '02-566',
        }
      : null;
  },
}));
const faktura = (o: Partial<JpkInvoice> = {}): JpkInvoice =>
  ({
    invoiceNumber: 'FV/1',
    invoiceType: 'regular',
    issueDate: '2026-08-10',
    buyerName: 'Klient',
    buyerNip: '5252241585',
    buyerAddress: 'ul. Klienta 10, 02-001 Warszawa',
    netTotal: 100,
    vatTotal: 23,
    grossTotal: 123,
    lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '23' }],
    ...o,
  }) as JpkInvoice;
const fetched = vi.hoisted(() => ({ issued: null as unknown[] | null, received: [] as unknown[] }));
vi.mock('@/lib/exports/data-fetcher', () => ({
  fetchInvoicesForExport: async () => ({
    issuer: { nip: '5260001246', name: 'Moja Firma' },
    issuedInvoices: fetched.issued ?? [faktura()],
    receivedInvoices: fetched.received,
    expenses: [],
  }),
}));

import { onExportsGenerateExhausted, runExportsGenerate } from '@/lib/inngest/jobs/exports-generate';
import { formatsWithoutUnaddressedJpkFa, runCoPilotSendPackage } from '@/lib/inngest/jobs/co-pilot-monthly';
import { MissingTaxOfficeError } from '@/lib/exports/tax-office';
import { MissingIssuerAddressError } from '@/lib/exports/issuer-address';
import { JpkFaCorrectionNotSupportedError } from '@/lib/exports/jpk-fa-generator';

/**
 * JPK_FA z urzędem skarbowym FIRMY (#67) — cały job eksportu, nie sam
 * generator: plik wysyłany do R2 musi znać urząd. Do 27.09 każdy plik wskazywał „1408”
 * (według słownika MF — US w Kozienicach).
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  db.office = null;
  db.updates = [];
  db.uploads = [];
  db.orderedFormats = [];
  db.corrections = 0;
  db.gusKnowsCompany = true;
  db.gusDown = false;
  fetched.issued = null;
  fetched.received = [];
});

describe('job eksportu JPK_FA', () => {
  it('urząd firmy trafia do pliku wysłanego do R2 — nie tylko do sumy kontrolnej', async () => {
    db.office = '1433';
    await runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0]).toContain('<KodUrzedu>1433</KodUrzedu>');
    expect(db.updates.some((u) => u.table === 'export_jobs' && u.patch.status === 'completed')).toBe(true);
  });

  it('bez urzędu: koniec bez ponawiania, z komunikatem — i bez pliku', async () => {
    const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
    await expect(run).rejects.toThrow(/Ustawienia → Księgowa/);
    expect(db.uploads).toEqual([]);
  });

  it('faktury zakupu nie trafiają do JPK_FA (plik faktur wystawionych)', async () => {
    db.office = '1433';
    fetched.received = [faktura({ invoiceNumber: 'ZAK/7', sellerName: 'Dostawca' })];
    await runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    expect(db.uploads[0]).toContain('<P_2A>FV/1</P_2A>');
    expect(db.uploads[0]).not.toContain('ZAK/7');
    expect(db.uploads[0]).toContain('<LiczbaFaktur>1</LiczbaFaktur>');
  });

  it('same zakupy w okresie: „brak faktur”, bez pliku', async () => {
    db.office = '1433';
    fetched.issued = [];
    fetched.received = [faktura({ invoiceNumber: 'ZAK/7' })];
    await runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    expect(db.uploads).toEqual([]);
    expect(db.updates.some((u) => u.patch.status === 'completed' && u.patch.invoices_count === 0)).toBe(true);
  });

  it.each([
    ['korekta w okresie', () => { fetched.issued = [faktura(), faktura({ invoiceNumber: 'KOR/1', invoiceType: 'correction' })]; }, /faktura korygująca/],
    ['GUS nie zna firmy', () => { db.gusKnowsCompany = false; }, /rejestrze GUS/],
  ])('%s: koniec bez ponawiania, z komunikatem — i bez pliku', async (_opis, ustaw, komunikat) => {
    db.office = '1433';
    ustaw();
    const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
    await expect(run).rejects.toThrow(komunikat);
    expect(db.uploads).toEqual([]);
  });
});

describe('eksport po wyczerpaniu prób — „nieudany” z powodem, nie wieczne „generuje się”', () => {
  it('brak urzędu: klient widzi, co zrobić', async () => {
    await onExportsGenerateExhausted(new Error(new MissingTaxOfficeError().message), { exportJobId: 'job-1' });
    expect(db.updates).toEqual([
      {
        table: 'export_jobs',
        patch: { status: 'failed', error_message: new MissingTaxOfficeError().message },
        statusIn: ['pending', 'generating'],
      },
    ]);
  });

  it.each([
    ['brak adresu w GUS', new MissingIssuerAddressError().message],
    ['korekta w JPK_FA', new JpkFaCorrectionNotSupportedError().message],
  ])('%s: klient widzi powód', async (_opis, komunikat) => {
    await onExportsGenerateExhausted(new Error(komunikat), { exportJobId: 'job-1' });
    expect(db.updates[0]!.patch.error_message).toBe(komunikat);
  });

  it('inny błąd: ogólny komunikat, bez szczegółów technicznych', async () => {
    await onExportsGenerateExhausted(new Error('relation "x" does not exist'), { exportJobId: 'job-1' });
    expect(db.updates[0]!.patch.error_message).not.toContain('relation');
    expect(db.updates[0]!.patch.status).toBe('failed');
  });
});

describe('Co-Pilot: bez urzędu JPK_FA zamienia się w CSV, paczka idzie', () => {
  it.each([
    [['jpk_fa', 'kpir_excel'], null, ['csv_universal', 'kpir_excel']],
    [['jpk_fa', 'csv_universal'], null, ['csv_universal']],
    [['jpk_fa', 'kpir_excel'], '1433', ['jpk_fa', 'kpir_excel']],
    [['kpir_excel'], null, ['kpir_excel']],
  ])('%j, urząd %j → %j', (formats, office, expected) => {
    expect(formatsWithoutUnaddressedJpkFa(formats, office)).toEqual(expected);
  });
});

describe('Co-Pilot zamawia eksporty z listy po zamianie', () => {
  const paczka = {
    tenantId: 'ten-1',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    formats: ['jpk_fa', 'kpir_excel'],
    accountantEmail: 'ksiegowa@example.test',
    accountantName: 'Księgowa',
    manual: true,
  } as Parameters<typeof runCoPilotSendPackage>[0];
  // Zatrzymujemy job na wysyłce zdarzeń — liczy się, CO zamówił.
  const stop: JobContext = {
    ...ctx,
    step: { ...ctx.step, sendEvent: async () => { throw new Error('STOP'); } },
  };

  it('bez urzędu: zamawia CSV zamiast JPK_FA', async () => {
    await expect(runCoPilotSendPackage(paczka, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });

  it('z urzędem: JPK_FA zostaje', async () => {
    db.office = '1433';
    await expect(runCoPilotSendPackage(paczka, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['jpk_fa', 'kpir_excel']);
  });

  // JPK_FA odmawia przy korekcie (C-01) i bez adresu z GUS — a jeden nieudany
  // format wywraca całą paczkę. Księgowa dostaje CSV zamiast niczego.
  it('korekta w okresie: CSV zamiast JPK_FA', async () => {
    db.office = '1433';
    db.corrections = 1;
    await expect(runCoPilotSendPackage(paczka, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });

  it('korekta, ale paczka bez korekt: JPK_FA nie jest blokowany', async () => {
    // Eksport „bez korekt” w ogóle ich nie czyta — korekta w okresie nie przeszkadza.
    db.corrections = 1;
    const { jpkFaBlocker } = await import('@/lib/exports/jpk-fa-readiness');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const powod = await jpkFaBlocker(createAdminClient() as never, {
      tenantId: 'ten-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', includeCorrections: false,
    });
    expect(powod).toBeNull();
  });

  it('GUS chwilowo nie odpowiada: paczka i tak idzie — z CSV zamiast JPK_FA', async () => {
    db.office = '1433';
    db.gusDown = true;
    await expect(runCoPilotSendPackage(paczka, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });

  it('GUS nie zna firmy: CSV zamiast JPK_FA', async () => {
    db.office = '1433';
    db.gusKnowsCompany = false;
    await expect(runCoPilotSendPackage(paczka, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });

  // 29.09: księgowa z Symfonią dostaje JPK_FA(4) — to jej program importuje —
  // a gdy JPK_FA nie może powstać, CSV (te same bramki co przy wyborze JPK_FA).
  const zSymfonia = { ...paczka, formats: ['symfonia', 'kpir_excel'] } as typeof paczka;

  it('Symfonia w ustawieniach: JPK_FA zamiast martwego CSV „Symfonia”', async () => {
    db.office = '1433';
    await expect(runCoPilotSendPackage(zSymfonia, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['jpk_fa', 'kpir_excel']);
  });

  it('Symfonia, ale bez urzędu: CSV', async () => {
    await expect(runCoPilotSendPackage(zSymfonia, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });

  it('Symfonia, korekta w okresie: CSV', async () => {
    db.office = '1433';
    db.corrections = 1;
    await expect(runCoPilotSendPackage(zSymfonia, stop)).rejects.toThrow('STOP');
    expect(db.orderedFormats).toEqual(['csv_universal', 'kpir_excel']);
  });
});
