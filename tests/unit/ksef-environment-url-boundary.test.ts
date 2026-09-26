import { afterEach, describe, expect, it, vi } from 'vitest';

import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { getKsefBaseUrl, ksefFetch } from '@/lib/ksef/client';
import { checkKsefAvailability } from '@/lib/ksef/health-check';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('KSeF environment URL boundary', () => {
  it.each([
    ['test', 'KSEF_TEST_URL', 'https://api.ksef.mf.gov.pl/v2'],
    ['demo', 'KSEF_DEMO_URL', 'https://API.KSEF.MF.GOV.PL.:444/v2/other'],
  ] as const)('rejects %s aimed at the production MF host', (env, variable, url) => {
    vi.stubEnv('KSEF_ENV', env);
    vi.stubEnv(variable, url);

    expect(configuredKsefEnvironment()).toBeNull();
    expect(() => getKsefBaseUrl(env)).toThrow(/production API/);
  });

  it('rejects malformed overrides and a production override', () => {
    vi.stubEnv('KSEF_ENV', 'test');
    vi.stubEnv('KSEF_TEST_URL', 'not a URL');
    expect(configuredKsefEnvironment()).toBeNull();
    expect(() => getKsefBaseUrl('test')).toThrow(/Invalid KSeF API URL/);

    vi.stubEnv('KSEF_ENV', 'production');
    vi.stubEnv('KSEF_PROD_URL', 'https://api-test.ksef.mf.gov.pl/v2');
    expect(configuredKsefEnvironment()).toBeNull();
    expect(() => getKsefBaseUrl('production')).toThrow(/official API URL/);
  });

  it.each([
    ['test', 'KSEF_TEST_URL', 'http://api-test.ksef.mf.gov.pl/v2'],
    ['demo', 'KSEF_DEMO_URL', 'https://untrusted.example/v2'],
  ] as const)('does not send %s credentials to an untrusted remote URL', async (env, variable, url) => {
    vi.stubEnv(variable, url);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => getKsefBaseUrl(env)).toThrow(/official environment endpoint/);
    await expect(ksefFetch('/health', { env, accessToken: 'test-token' })).rejects.toThrow(/official environment endpoint/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a bad URL as unavailable without breaking the health-check job', async () => {
    vi.stubEnv('KSEF_TEST_URL', 'not a URL');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkKsefAvailability('test')).resolves.toMatchObject({
      available: false,
      isMfOutage: false,
      error: 'Invalid KSeF API URL',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps legitimate test, local test and official production URLs', () => {
    vi.stubEnv('KSEF_ENV', 'test');
    vi.stubEnv('KSEF_TEST_URL', 'https://api-test.ksef.mf.gov.pl/v2');
    expect(configuredKsefEnvironment()).toBe('test');

    vi.stubEnv('KSEF_TEST_URL', 'http://127.0.0.1:3000/v2');
    expect(configuredKsefEnvironment()).toBe('test');

    vi.stubEnv('KSEF_ENV', 'production');
    vi.stubEnv('KSEF_PROD_URL', 'https://api.ksef.mf.gov.pl/v2');
    expect(configuredKsefEnvironment()).toBe('production');
  });

  it('does not follow redirects when sending bearer credentials', async () => {
    vi.stubEnv('E2E_MOCK_KSEF', '0');
    vi.stubEnv('KSEF_TEST_URL', 'https://api-test.ksef.mf.gov.pl/v2');
    const fetchMock = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await ksefFetch('/health', { env: 'test', accessToken: 'test-token' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-test.ksef.mf.gov.pl/v2/health',
      expect.objectContaining({ redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });
});
