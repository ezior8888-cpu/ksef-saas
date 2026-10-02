import { beforeEach, describe, expect, it, vi } from 'vitest';

// AUD-18: pobieranie skrzynki wg kontraktu MF dla `POST /invoices/query/metadata`
// (OpenAPI KSeF 2.0): stronicowanie `pageOffset` (indeks strony) + `pageSize`
// i `hasMore`; przy `isTruncated` (limit 10 000) nowe `dateRange.from` od daty
// ostatniego rekordu i `pageOffset = 0`; scenariusz przyrostowy na dacie
// `PermanentStorage`, sortowanie `Asc`, `restrictToPermanentStorageHwmDate`.
// Wcześniej klient czekał na `continuationToken`, którego ten endpoint nie
// zwraca — kończył na pierwszej stronie (domyślnie 10 faktur).

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
// Adres API sprawdzany dla każdego środowiska (#64).
vi.mock('@/lib/ksef/client', () => ({ ksefFetch: mocks.fetch, getKsefBaseUrl: () => 'https://api-test.ksef.mf.gov.pl/v2' }));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'fixture-token' }) },
}));
vi.mock('@/lib/ksef/rate-limiter', () => ({
  ksefRateLimiter: { enqueue: (_nip: string, fn: () => unknown) => fn() },
}));

import { queryReceivedInvoices } from '@/lib/ksef/inbox';
import type { KsefAuth } from '@/lib/ksef/auth';

const auth = { nip: '1234567890' } as KsefAuth;
const FROM = new Date('2026-09-20T00:00:00Z');
const TO = new Date('2026-10-02T00:00:00Z');

function inv(n: number, storedAt: string) {
  return { ksefNumber: `1234567890-20260925-${String(n).padStart(12, '0')}-00`, permanentStorageDate: storedAt };
}

type Call = [string, { method: string; body: { subjectType: string; dateRange: Record<string, unknown> }; headers?: Record<string, string> }];
const calls = () => mocks.fetch.mock.calls as unknown as Call[];
const query = (i: number) => new URL('https://x' + calls()[i]![0]).searchParams;

beforeEach(() => {
  mocks.fetch.mockReset();
});

describe('queryReceivedInvoices — kontrakt MF', () => {
  it('pyta po PermanentStorage, rosnąco, z ograniczeniem do HWM i maksymalną stroną', async () => {
    mocks.fetch.mockResolvedValueOnce({ invoices: [], hasMore: false, isTruncated: false, permanentStorageHwmDate: '2026-10-01T23:58:00Z' });
    await queryReceivedInvoices(auth, FROM, TO, 'test');
    const [path, init] = calls()[0]!;
    expect(path.startsWith('/invoices/query/metadata?')).toBe(true);
    expect(query(0).get('pageOffset')).toBe('0');
    expect(query(0).get('pageSize')).toBe('250');
    expect(query(0).get('sortOrder')).toBe('Asc');
    expect(init.body.dateRange).toEqual({
      dateType: 'PermanentStorage',
      from: FROM.toISOString(),
      to: TO.toISOString(),
      restrictToPermanentStorageHwmDate: true,
    });
    expect(init.headers?.['x-continuation-token']).toBeUndefined();
  });

  it('idzie po stronach, dopóki hasMore, i zwraca HWM z odpowiedzi', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ invoices: [inv(1, '2026-09-21T10:00:00Z')], hasMore: true, isTruncated: false, permanentStorageHwmDate: '2026-10-01T23:58:00Z' })
      .mockResolvedValueOnce({ invoices: [inv(2, '2026-09-22T10:00:00Z')], hasMore: true, isTruncated: false, permanentStorageHwmDate: '2026-10-01T23:58:00Z' })
      .mockResolvedValueOnce({ invoices: [inv(3, '2026-09-23T10:00:00Z')], hasMore: false, isTruncated: false, permanentStorageHwmDate: '2026-10-01T23:58:00Z' });
    const result = await queryReceivedInvoices(auth, FROM, TO, 'test');
    expect(calls()).toHaveLength(3);
    expect([0, 1, 2].map((i) => query(i).get('pageOffset'))).toEqual(['0', '1', '2']);
    expect(result.invoices.map((i) => i.ksefNumber)).toEqual([inv(1, '').ksefNumber, inv(2, '').ksefNumber, inv(3, '').ksefNumber]);
    expect(result.hwm).toBe('2026-10-01T23:58:00Z');
  });

  it('przy isTruncated zawęża dateRange od ostatniego rekordu, zeruje pageOffset i usuwa duble', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ invoices: [inv(1, '2026-09-21T10:00:00Z'), inv(2, '2026-09-25T08:00:00Z')], hasMore: true, isTruncated: true, permanentStorageHwmDate: '2026-10-01T23:58:00Z' })
      .mockResolvedValueOnce({ invoices: [inv(2, '2026-09-25T08:00:00Z'), inv(3, '2026-09-26T08:00:00Z')], hasMore: false, isTruncated: false, permanentStorageHwmDate: '2026-10-01T23:59:00Z' });
    const result = await queryReceivedInvoices(auth, FROM, TO, 'test');
    expect(calls()[1]![1].body.dateRange.from).toBe('2026-09-25T08:00:00Z');
    expect(query(1).get('pageOffset')).toBe('0');
    expect(result.invoices.map((i) => i.ksefNumber)).toEqual([inv(1, '').ksefNumber, inv(2, '').ksefNumber, inv(3, '').ksefNumber]);
    expect(result.hwm).toBe('2026-10-01T23:59:00Z');
  });

  it('brak HWM w odpowiedzi = null (okno nie może się przesunąć)', async () => {
    mocks.fetch.mockResolvedValueOnce({ invoices: [], hasMore: false, isTruncated: false, permanentStorageHwmDate: null });
    const result = await queryReceivedInvoices(auth, FROM, TO, 'test');
    expect(result.hwm).toBeNull();
  });
});

// NOWE-01 (poza audytem, ta sama wada): import historii z KSeF też czekał
// na `continuationToken` i kończył na pierwszej stronie.
describe('import historii — stronicowanie pageOffset/hasMore', () => {
  it('pobiera wszystkie strony okresu', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ksef/session-cache', () => ({
      getValidSession: async () => ({ auth: { nip: '1234567890' } }),
      ksefSessionCache: { getSession: async () => ({ accessToken: 'fixture-token' }) },
    }));
    const { fetchInvoicesMetadata: fetchInvoiceHistory } = await import('@/lib/ksef/history-fetcher');
    const meta = (n: number) => ({
      ksefNumber: `K-${n}`, invoiceNumber: `FV ${n}`, issueDate: '2026-09-01', acquisitionDate: '2026-09-01T10:00:00Z',
      netAmount: 100, vatAmount: 23, grossAmount: 123,
      seller: { nip: '5260001246', name: 'Dostawca' }, buyer: { identifier: { type: 'Nip', value: '1234567890' } },
    });
    mocks.fetch
      .mockResolvedValueOnce({ invoices: [meta(1)], hasMore: true, isTruncated: false })
      .mockResolvedValueOnce({ invoices: [meta(2)], hasMore: false, isTruncated: false });
    const result = await fetchInvoiceHistory({ tenantId: 't1', dateFrom: '2026-09-01', dateTo: '2026-09-30', direction: 'received', env: 'test' });
    expect(result.invoices.map((i) => i.ksefNumber)).toEqual(['K-1', 'K-2']);
    expect([0, 1].map((i) => query(i).get('pageOffset'))).toEqual(['0', '1']);
    expect(calls()[0]![1].headers?.['x-continuation-token']).toBeUndefined();
  });
});
