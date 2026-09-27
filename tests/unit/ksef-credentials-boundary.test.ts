import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  single: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single }),
      }),
    }),
  }),
}));

vi.mock('@/lib/ksef/credentials-crypto', () => ({
  decryptCredentials: mocks.decrypt,
}));

import { getTenantKsefCredentials } from '@/lib/supabase/admin-queries';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  mocks.single.mockResolvedValue({
    data: {
      nip: '1234567890',
      ksef_credentials_encrypted: '\\x010203',
      ksef_verified_at: '2026-09-25T12:00:00.000Z',
      ksef_verified_environment: 'test',
    },
    error: null,
  });
  mocks.decrypt.mockReturnValue({
    type: 'xades',
    nip: '1234567890',
    certificatePem: 'test-certificate',
    privateKeyPem: 'test-private-key',
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('KSeF credential use boundary', () => {
  it('uses credentials only for a verified matching NIP', async () => {
    await expect(getTenantKsefCredentials('tenant-test')).resolves.toMatchObject({
      type: 'xades',
      nip: '1234567890',
    });
  });

  it('rejects historical credentials without a verified marker before decrypting', async () => {
    mocks.single.mockResolvedValue({
      data: {
        nip: '1234567890',
        ksef_credentials_encrypted: '\\x010203',
        ksef_verified_at: null,
      },
      error: null,
    });
    await expect(getTenantKsefCredentials('tenant-test'))
      .rejects.toThrow('KSeF NIP is not verified');
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('rejects a legacy marker without environment provenance before decrypting', async () => {
    mocks.single.mockResolvedValue({
      data: {
        nip: '1234567890', ksef_credentials_encrypted: '\\x010203',
        ksef_verified_at: '2026-09-25T12:00:00.000Z',
        ksef_verified_environment: null,
      }, error: null,
    });
    await expect(getTenantKsefCredentials('tenant-test')).rejects.toThrow('not verified');
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('rejects a TEST proof when the worker is configured for production', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    await expect(getTenantKsefCredentials('tenant-test')).rejects.toThrow('not verified');
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('rejects credentials bound to another NIP', async () => {
    mocks.decrypt.mockReturnValue({
      type: 'xades',
      nip: '0987654321',
      certificatePem: 'test-certificate',
      privateKeyPem: 'test-private-key',
    });
    await expect(getTenantKsefCredentials('tenant-test'))
      .rejects.toThrow('KSeF credential NIP differs from verified NIP');
  });
});