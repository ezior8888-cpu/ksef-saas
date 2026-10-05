import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryClient, type MemoryTables } from './helpers/baza-w-pamieci';

vi.mock('@/lib/exports/issuer-address', async (orig) => ({
  ...(await orig<typeof import('@/lib/exports/issuer-address')>()),
  readIssuerRegisteredAddress: async () => ({
    voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', buildingNumber: '1', city: 'Warszawa', postCode: '00-001',
  }),
}));

import { jpkFaBlocker } from '@/lib/exports/jpk-fa-readiness';

/**
 * W9 (C5a): paczka Co-Pilot dla księgowej sprawdza przed utworzeniem
 * eksportów, czy JPK_FA powstanie (jeden nieudany format wywraca paczkę).
 * Faktura z importu ze stawką spoza FaktFlow albo zaimportowana korekta /
 * zaliczka / ROZ zablokuje JPK_FA — paczka ma dostać CSV, z powodem.
 */

let tables: MemoryTables;
const faktura = (o: Record<string, unknown>) => ({
  tenant_id: 'firma-a', direction: 'outgoing', ksef_status: 'accepted', ksef_environment: 'test',
  issue_date: '2026-09-10', invoice_kind: 'regular', invoice_type: 'VAT', origin: 'ksef_import', ...o,
});
const blocker = () => jpkFaBlocker(memoryClient(tables) as never, {
  tenantId: 'firma-a', periodStart: '2026-09-01', periodEnd: '2026-09-30', includeCorrections: true,
});

beforeEach(() => {
  vi.stubEnv('KSEF_ENV', 'test');
  tables = {
    tenants: [{ id: 'firma-a', nip: '5260001246' }],
    invoices: [faktura({ id: 'fv-1', internal_number: 'FV/1' })],
    invoice_line_items: [{ id: 'l-1', invoice_id: 'fv-1', vat_rate: '23' }],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('jpkFaBlocker — dokumenty, których JPK nie wykaże poprawnie', () => {
  it('same stawki FaktFlow → brak blokady', async () => {
    expect(await blocker()).toBeNull();
  });

  it('pozycja „0 WDT” z importu → powód z numerem faktury (paczka dostanie CSV)', async () => {
    tables.invoices!.push(faktura({ id: 'fv-wdt', internal_number: 'FV/WDT/1', ksef_number: '5260001246-20260910-0100A0B0C0D1-AF' }));
    tables.invoice_line_items!.push({ id: 'l-2', invoice_id: 'fv-wdt', vat_rate: '0 WDT' });
    expect(await blocker()).toMatch(/JPK wstrzymany:.*FV\/WDT\/1.*0 WDT/);
  });

  it('zaimportowana korekta (invoice_kind regular, invoice_type KOR) → powód z numerem', async () => {
    tables.invoices!.push(faktura({ id: 'kor-1', internal_number: 'KOR/1', invoice_type: 'KOR' }));
    tables.invoice_line_items!.push({ id: 'l-3', invoice_id: 'kor-1', vat_rate: '23' });
    expect(await blocker()).toMatch(/JPK wstrzymany:.*KOR\/1/);
  });

  it('dokument z innego środowiska KSeF nie blokuje (eksport go nie czyta)', async () => {
    tables.invoices!.push(faktura({ id: 'fv-prod', internal_number: 'FV/PROD/1', ksef_environment: 'production' }));
    tables.invoice_line_items!.push({ id: 'l-4', invoice_id: 'fv-prod', vat_rate: '0 WDT' });
    expect(await blocker()).toBeNull();
  });
});
