import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  issued: [] as unknown[],
  received: [] as unknown[],
  gusKnowsCompany: true,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: () => 'err-1' }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
// Atrapa bazy: dostęp księgowej i urząd firmy.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'accountant_access'
              ? { data: { id: 'acc-1', tenant_id: TENANT, access_level: 'download', revoked_at: null, expires_at: null }, error: null }
              : { data: { tax_office_code: '1433' }, error: null },
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/exports/data-fetcher', () => ({
  fetchInvoicesForExport: async () => ({
    issuer: { nip: '5260001246', name: 'ACME' },
    issuedInvoices: mocks.issued,
    receivedInvoices: mocks.received,
    expenses: [],
  }),
}));
// Adres z GUS bez sieci.
vi.mock('@/lib/exports/issuer-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/exports/issuer-address')>()),
  readIssuerRegisteredAddress: async () =>
    mocks.gusKnowsCompany
      ? { voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', buildingNumber: '1', city: 'Warszawa', postCode: '00-001' }
      : null,
}));

import { POST } from '@/app/api/portal/exports/generate/route';
import { MissingIssuerAddressError } from '@/lib/exports/issuer-address';
import { JpkFaCorrectionNotSupportedError, type JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { validateJpkFa } from '@/lib/exports/jpk-fa-validator';

/**
 * Portal księgowej — JPK_FA(4) pobierany od ręki. Powody odmowy (adres z GUS,
 * korekta, same zakupy) mają wrócić jako 422 z komunikatem dla człowieka,
 * nie jako ogólne „nie udało się” (500).
 */

const TENANT = '11111111-1111-4111-8111-111111111111';

const faktura = (o: Partial<JpkInvoice> = {}): JpkInvoice => ({
  invoiceNumber: 'FV/1', invoiceType: 'regular', issueDate: '2026-09-10', buyerName: 'Klient', buyerNip: '5252241585',
  netTotal: 100, vatTotal: 23, grossTotal: 123,
  lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '23', vatAmount: 23 }],
  ...o,
});

const pobierz = () =>
  POST(new NextRequest('https://app.example.test/api/portal/exports/generate', {
    method: 'POST',
    headers: { 'x-accountant-token': 'token-ksiegowej' },
    body: JSON.stringify({ tenantId: TENANT, format: 'jpk_fa', periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
  }));

beforeEach(() => {
  mocks.issued = [faktura()];
  mocks.received = [];
  mocks.gusKnowsCompany = true;
});

describe('portal: JPK_FA(4)', () => {
  it('plik zgodny z XSD, bez faktur zakupu', async () => {
    mocks.received = [faktura({ invoiceNumber: 'ZAK/7' })];
    const odp = await pobierz();
    expect(odp.status).toBe(200);
    const xml = await odp.text();
    expect(xml).not.toContain('ZAK/7');
    expect((await validateJpkFa(xml)).valid).toBe(true);
  });

  it.each([
    ['GUS nie zna firmy', () => { mocks.gusKnowsCompany = false; }, new MissingIssuerAddressError().message],
    ['korekta w okresie', () => { mocks.issued = [faktura(), faktura({ invoiceNumber: 'KOR/1', invoiceType: 'correction' })]; }, new JpkFaCorrectionNotSupportedError().message],
    ['same zakupy', () => { mocks.issued = []; mocks.received = [faktura({ invoiceNumber: 'ZAK/7' })]; }, 'Brak faktur wystawionych w wybranym okresie.'],
  ])('%s → 422 z powodem', async (_opis, ustaw, komunikat) => {
    ustaw();
    const odp = await pobierz();
    expect(odp.status).toBe(422);
    expect(await odp.json()).toEqual({ error: komunikat });
  });
});
