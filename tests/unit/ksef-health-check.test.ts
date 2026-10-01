import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkKsefAvailability,
  KSEF_HEALTH_PROBE_PATH,
  shouldUseOfflineMode,
} from '@/lib/ksef/health-check';

/**
 * AUD-130: KSeF 2.0 nie ma publicznego `/health` (401 na TEST i PROD), więc
 * monitor tygodniami widział „down”, a wysyłki XAdES szły do Offline24.
 * Te testy pilnują, żeby sonda pytała o publiczny endpoint i żeby tylko
 * prawdziwe sygnały awarii MF (5xx, 429, brak odpowiedzi) włączały tryb offline.
 */

const fetchMock = vi.fn();

function respond(status: number): Response {
  return new Response(status === 204 ? null : '[]', { status });
}

describe('checkKsefAvailability — sonda zdrowia KSeF (AUD-130)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pyta o publiczny endpoint certyfikatów MF, nie o nieistniejący /health', async () => {
    fetchMock.mockResolvedValue(respond(200));

    await checkKsefAvailability('test');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url.endsWith(`/v2${KSEF_HEALTH_PROBE_PATH}`)).toBe(true);
    expect(url).not.toMatch(/\/health$/);
  });

  it('200 → KSeF dostępny', async () => {
    fetchMock.mockResolvedValue(respond(200));

    const result = await checkKsefAvailability('production');

    expect(result.available).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it.each([401, 403, 404])(
    '%i → serwer odpowiedział, więc KSeF jest osiągalny; błąd sondy zostaje widoczny',
    async (status) => {
      fetchMock.mockResolvedValue(respond(status));

      const result = await checkKsefAvailability('test');

      expect(result.available).toBe(true);
      expect(result.error).toContain(String(status));
    },
  );

  it('503 → niedostępny i oznaczony jako awaria MF', async () => {
    fetchMock.mockResolvedValue(respond(503));

    const result = await checkKsefAvailability('test');

    expect(result).toMatchObject({ available: false, isMfOutage: true });
  });

  it.each([500, 502, 429])('%i → niedostępny, bez flagi awarii MF', async (status) => {
    fetchMock.mockResolvedValue(respond(status));

    const result = await checkKsefAvailability('test');

    expect(result).toMatchObject({ available: false, isMfOutage: false });
    expect(result.error).toBe(`KSeF returned ${status}`);
  });

  it('timeout → niedostępny', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValue(abort);

    const result = await checkKsefAvailability('test');

    expect(result).toMatchObject({ available: false, error: 'Request aborted (timeout)' });
  });

  it('błąd sieci → niedostępny', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await checkKsefAvailability('test');

    expect(result.available).toBe(false);
  });
});

describe('shouldUseOfflineMode — decyzja o Offline24', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401 z sondy nie przełącza faktur w Offline24 (regresja z produkcji)', async () => {
    fetchMock.mockResolvedValue(respond(401));

    await expect(shouldUseOfflineMode('test')).resolves.toEqual({
      offline: false,
      reason: null,
      isMfOutage: false,
    });
  });

  it('503 przełącza w tryb offline jako awaria MF', async () => {
    fetchMock.mockResolvedValue(respond(503));

    await expect(shouldUseOfflineMode('test')).resolves.toEqual({
      offline: true,
      reason: 'ksef_down',
      isMfOutage: true,
    });
  });

  it('429 zostaje rozpoznany jako limit zapytań', async () => {
    fetchMock.mockResolvedValue(respond(429));

    const result = await shouldUseOfflineMode('test');

    expect(result.reason).toBe('rate_limit');
  });
});
