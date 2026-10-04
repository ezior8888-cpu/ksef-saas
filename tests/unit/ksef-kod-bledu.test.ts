import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * F-093 (audyt bloku 1): `KsefApiError.ksefCode` czytał
 * `body.exceptionDetailList`, a KSeF zwraca kody w `errors[].code`
 * (`application/problem+json`) albo w `exception.exceptionDetailList` —
 * getter dawał zawsze `null` (do Sentry z joba wysyłki szło `ksefCode: null`).
 *
 * Przy okazji: `ksefFetch` parsował JSON tylko dla `application/json`, więc
 * odpowiedź `application/problem+json` zostawała tekstem i żaden odczyt kodu
 * jej nie widział — także obsługa 21184 „Sesja tymczasowo niedostępna”
 * (F-050), której test podmienia `ksefFetch` i tego nie łapał.
 */

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

import { KsefApiError, ksefErrorCodes, ksefFetch } from '@/lib/ksef/client';
import { ksefErrorCodes as ksefErrorCodesFromSubmit, submitInvoice } from '@/lib/ksef/submit';
import type { KsefAuth } from '@/lib/ksef/auth';

const PROBLEM_21184 = {
  title: 'Bad Request',
  status: 400,
  errors: [{ code: 21184, description: 'Sesja tymczasowo niedostępna.' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KsefApiError.ksefCode (F-093)', () => {
  it.each([
    ['problem+json', { title: 'Bad Request', status: 400, errors: [{ code: 21405, description: 'Błąd walidacji.' }] }, 21405],
    ['exception.exceptionDetailList', { exception: { serviceCode: 'x', exceptionDetailList: [{ exceptionCode: 21184, exceptionDescription: 'Sesja tymczasowo niedostępna.' }] } }, 21184],
    ['atrapa: lista na wierzchu', { exceptionDetailList: [{ exceptionCode: 21001, exceptionDescription: 'Service temporarily unavailable' }] }, 21001],
    ['kod jako tekst', { errors: [{ code: '21405' }] }, 21405],
    ['tekst zamiast JSON', 'Bad Gateway', null],
    ['JSON bez kodów', { title: 'Bad Request', status: 400 }, null],
  ])('%s → %s', (_label, body, code) => {
    const err = new KsefApiError(400, body as never, 'KSeF API POST /x failed: 400');
    expect(err.ksefCode).toBe(code);
  });

  it('kilka kodów — getter daje pierwszy, ksefErrorCodes wszystkie', () => {
    const body = { errors: [{ code: 21405 }, { code: 21184 }] };
    expect(new KsefApiError(400, body, 'x').ksefCode).toBe(21405);
    expect(ksefErrorCodes(body)).toEqual([21405, 21184]);
  });

  it('job wysyłki bierze ksefErrorCodes z submit — to ta sama funkcja co w kliencie', () => {
    expect(ksefErrorCodesFromSubmit).toBe(ksefErrorCodes);
  });
});

describe('ksefFetch: odpowiedź application/problem+json', () => {
  it.each([
    'application/problem+json',
    'application/problem+json; charset=utf-8',
    'Application/JSON; charset=utf-8',
  ])('%s — ciało błędu sparsowane, kod do odczytu', async (contentType) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(PROBLEM_21184), {
      status: 400,
      headers: { 'content-type': contentType },
    })));

    const err = await ksefFetch('/test', { env: 'test' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KsefApiError);
    expect((err as KsefApiError).body).toEqual(PROBLEM_21184);
    expect((err as KsefApiError).ksefCode).toBe(21184);
  });

  it('inny typ treści zostaje tekstem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"errors":[{"code":21184}]}', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })));

    const err = await ksefFetch('/test', { env: 'test' }).catch((e: unknown) => e);

    expect((err as KsefApiError).body).toBe('{"errors":[{"code":21184}]}');
    expect((err as KsefApiError).ksefCode).toBeNull();
  });

  it('21184 jako problem+json z prawdziwego ksefFetch — wysyłka ponawialna (F-050)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/sessions/online')) {
        return new Response(JSON.stringify({ referenceNumber: 'SESJA-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/invoices')) {
        return new Response(JSON.stringify(PROBLEM_21184), {
          status: 400,
          headers: { 'content-type': 'application/problem+json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const auth = { type: 'token', nip: '1234567890', token: 'x' } as unknown as KsefAuth;

    const err = await submitInvoice('<Faktura/>', auth, 'test').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KsefApiError);
    expect((err as KsefApiError).isRetryable).toBe(true);
    expect((err as KsefApiError).message).toContain('21184');
  });
});
