import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-050 (audyt bloku 1): KSeF API 2.8.0 (produkcja od 23.09.2026) zwraca
 * HTTP 400 z kodem 21184 „Sesja tymczasowo niedostępna”, gdy wysyłka
 * w istniejącej sesji jest chwilowo wstrzymana; MF zaleca otworzyć nową sesję
 * i kontynuować (CIRFMF, api-changelog.md). Aplikacja traktowała każde 400
 * jak ostateczne odrzucenie — faktura kończyła jako odrzucona i martwa.
 * KSeF zwraca błąd w dwóch kształtach: `application/problem+json`
 * (`errors[].code`) albo starszym `exception.exceptionDetailList[].exceptionCode`.
 */

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/ksef/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/ksef/client')>()),
  ksefFetch: mocks.fetch,
}));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'token' }) },
}));
vi.mock('@/lib/ksef/rate-limiter', () => ({
  ksefRateLimiter: { enqueue: (_nip: string, fn: () => unknown) => fn() },
}));
vi.mock('@/lib/ksef/encryption', () => ({
  generateSessionEncryption: async () => ({ encryptedSymmetricKey: 'k', initializationVector: 'iv' }),
  encryptInvoiceXml: () => ({
    invoiceHash: 'h', invoiceSize: 1, encryptedInvoiceHash: 'eh', encryptedInvoiceSize: 1, encryptedInvoiceContent: 'c',
  }),
}));

import { KsefApiError } from '@/lib/ksef/client';
import { submitInvoice } from '@/lib/ksef/submit';
import type { KsefAuth } from '@/lib/ksef/auth';

const AUTH = { type: 'token', nip: '5260001246', token: 'x' } as unknown as KsefAuth;

function sendFailsWith(body: unknown) {
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path === '/sessions/online') return { referenceNumber: 'SESJA-1' };
    if (path.endsWith('/invoices')) {
      throw new KsefApiError(400, body as never, `KSeF API POST ${path} failed: 400`);
    }
    return {};
  });
}

beforeEach(() => {
  mocks.fetch.mockReset();
});

describe('KSeF 21184 „Sesja tymczasowo niedostępna” (F-050)', () => {
  it.each([
    ['problem+json', { title: 'Bad Request', status: 400, errors: [{ code: 21184, description: 'Sesja tymczasowo niedostępna.' }] }],
    ['starszy format', { exception: { exceptionDetailList: [{ exceptionCode: 21184, exceptionDescription: 'Sesja tymczasowo niedostępna.' }] } }],
  ])('%s — błąd ponawialny (kolejna próba otworzy nową sesję)', async (_label, body) => {
    sendFailsWith(body);
    const err = await submitInvoice('<Faktura/>', AUTH, 'test').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefApiError);
    expect((err as KsefApiError).isRetryable).toBe(true);
    expect((err as KsefApiError).message).toContain('21184');
  });

  it('inny błąd 400 (walidacja) zostaje ostateczny', async () => {
    sendFailsWith({ title: 'Bad Request', status: 400, errors: [{ code: 21405, description: 'Błąd walidacji danych wejściowych.' }] });
    const err = await submitInvoice('<Faktura/>', AUTH, 'test').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefApiError);
    expect((err as KsefApiError).isRetryable).toBe(false);
  });
});
