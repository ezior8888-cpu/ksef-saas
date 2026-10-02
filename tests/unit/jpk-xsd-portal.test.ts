import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ breakXml: false }));

vi.mock('@sentry/nextjs', () => ({ captureException: () => 'err-1' }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
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
    issuedInvoices: [
      {
        invoiceNumber: 'FV/1', invoiceType: 'regular', issueDate: '2026-09-10', buyerName: 'Klient', buyerNip: '5252241585',
        netTotal: 100, vatTotal: 23, grossTotal: 123,
        lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '23', vatAmount: 23 }],
      },
    ],
    receivedInvoices: [],
    expenses: [],
  }),
}));
vi.mock('@/lib/exports/issuer-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/exports/issuer-address')>()),
  readIssuerRegisteredAddress: async () => ({
    voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', buildingNumber: '1', city: 'Warszawa', postCode: '00-001',
  }),
}));
// Błąd generatora udajemy kodem urzędu spoza słownika MF.
vi.mock('@/lib/exports/jpk-fa-generator', async (orig) => {
  const real = await orig<typeof import('@/lib/exports/jpk-fa-generator')>();
  return {
    ...real,
    generateJpkFa: (...a: Parameters<typeof real.generateJpkFa>) => {
      const xml = real.generateJpkFa(...a);
      return mocks.breakXml
        ? xml.replace(/(<(?:\w+:)?KodUrzedu>)\d+(<\/(?:\w+:)?KodUrzedu>)/, '$10000$2')
        : xml;
    },
  };
});

import { POST } from '@/app/api/portal/exports/generate/route';

/**
 * AUD-121, portal księgowej: JPK_FA pobierany od ręki też przechodzi XSD MF
 * przed wydaniem. Plik niezgodny to 422 z powodem, nie plik do urzędu.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';

const pobierz = () =>
  POST(new NextRequest('https://app.example.test/api/portal/exports/generate', {
    method: 'POST',
    headers: { 'x-accountant-token': 'token-ksiegowej' },
    body: JSON.stringify({ tenantId: TENANT, format: 'jpk_fa', periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
  }));

beforeEach(() => {
  mocks.breakXml = false;
});

describe('portal: JPK_FA tylko zgodny ze schematem MF', () => {
  it('plik zgodny — 200', async () => {
    expect((await pobierz()).status).toBe(200);
  });

  it('plik niezgodny — 422 z powodem, bez pliku', async () => {
    mocks.breakXml = true;

    const odp = await pobierz();

    expect(odp.status).toBe(422);
    const body = (await odp.json()) as { error: string };
    expect(body.error).toMatch(/schematem Ministerstwa Finansów/);
  });
});
