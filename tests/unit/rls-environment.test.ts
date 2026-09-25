import { afterEach, describe, expect, it, vi } from 'vitest';
import localConfig from '../../vitest.config';
import rlsConfig from '../../vitest.rls.config';
import { getRlsTestEnvironment } from '../helpers/rls-environment';
import { createUserScopedClient } from '../helpers/tenant-client';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => mocks);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const testEnv = {
  RLS_TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
  RLS_TEST_SUPABASE_ANON_KEY: 'test-anon-placeholder',
  RLS_TEST_SUPABASE_SERVICE_ROLE_KEY: 'test-service-placeholder',
  RLS_TEST_ALLOW_DESTRUCTIVE: 'isolated-local-database',
};

const applicationEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://application.example.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'application-anon-placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'application-service-placeholder',
};

describe('separate RLS test configuration', () => {
  it('excludes RLS from the default run and disables automatic .env loading', () => {
    expect(localConfig.envDir).toBe(false);
    expect(localConfig.test?.exclude).toContain('tests/rls-isolation.test.ts');
    expect(localConfig.test?.setupFiles).toEqual(['./tests/setup.ts']);
  });

  it('the explicit config runs only RLS and preserves server module aliases', () => {
    expect(rlsConfig.envDir).toBe(false);
    expect(rlsConfig.test?.include).toEqual(['tests/rls-isolation.test.ts']);
    expect(rlsConfig.test?.exclude).toEqual([]);
    expect(rlsConfig.test?.setupFiles).toEqual(['./tests/setup-rls.ts']);
    expect(rlsConfig.resolve?.alias).toEqual(localConfig.resolve?.alias);
  });

  it('never uses application database credentials as a fallback', () => {
    expect(() => getRlsTestEnvironment(applicationEnv)).toThrow(
      'RLS_TEST_SUPABASE_URL, RLS_TEST_SUPABASE_ANON_KEY, RLS_TEST_SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  it('rejects each missing or whitespace-only explicit parameter', () => {
    for (const key of Object.keys(testEnv)) {
      expect(() => getRlsTestEnvironment({ ...testEnv, [key]: undefined })).toThrow(key);
      expect(() => getRlsTestEnvironment({ ...testEnv, [key]: '   ' })).toThrow(key);
    }
  });

  it.each(['true', '1', 'production', 'isolated-local-database '])(
    'rejects a non-matching destructive-test acknowledgement: %s',
    (acknowledgement) => {
      expect(() => getRlsTestEnvironment({
        ...testEnv,
        RLS_TEST_ALLOW_DESTRUCTIVE: acknowledgement,
      })).toThrow('RLS_TEST_ALLOW_DESTRUCTIVE');
    },
  );

  it.each(['http://127.0.0.1:54321', 'http://[::1]:54321'])(
    'accepts an acknowledged local test database with separate keys: %s',
    (url) => {
      expect(getRlsTestEnvironment({
        ...applicationEnv,
        ...testEnv,
        RLS_TEST_SUPABASE_URL: url,
      })).toEqual({
        url,
        anonKey: testEnv.RLS_TEST_SUPABASE_ANON_KEY,
        serviceRoleKey: testEnv.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY,
      });
    },
  );

  it.each([
    'https://production.example.test',
    'https://staging.example.test',
    'http://192.168.1.10:54321',
    'http://localhost:54321',
    'http://127.0.0.1.example.test:54321',
    'http://[::ffff:127.0.0.1]:54321',
  ])('rejects remote, DNS-based and unsupported targets even with acknowledgement: %s', (url) => {
    expect(() => getRlsTestEnvironment({
      ...testEnv,
      RLS_TEST_SUPABASE_URL: url,
    })).toThrow('numeryczny loopback');
  });

  it('rejects malformed or decorated URLs without reflecting credentials in errors', () => {
    for (const url of [
      'not-a-url',
      'file:///tmp/db',
      'https://user:secret@127.0.0.1:54321',
      'https://127.0.0.1:54321/?key=secret',
      'https://127.0.0.1:54321/#secret',
      'https://127.0.0.1:54321/proxy/secret',
    ]) {
      let message = '';
      try { getRlsTestEnvironment({ ...testEnv, RLS_TEST_SUPABASE_URL: url }); }
      catch (error) { message = (error as Error).message; }
      expect(message).toContain('RLS_TEST_SUPABASE_URL');
      expect(message).not.toContain('secret');
    }
  });

  it.each([
    'http://127.0.0.1:54321/',
    'https://127.0.0.1:54321/app-path',
    'http://localhost:54321',
    'http://[::1]:54321',
  ])('rejects the application target even through local URL variations: %s', (url) => {
    expect(() => getRlsTestEnvironment({
      ...testEnv,
      NEXT_PUBLIC_SUPABASE_URL: url,
    })).toThrow('pokrywa się z bazą aplikacji');
  });

  it('rejects an invalid application URL instead of skipping the comparison', () => {
    expect(() => getRlsTestEnvironment({
      ...testEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'malformed-secret',
    })).toThrow('NEXT_PUBLIC_SUPABASE_URL ma niepoprawny format');
  });

  it.each([
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'RLS_TEST_SUPABASE_ANON_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'RLS_TEST_SUPABASE_SERVICE_ROLE_KEY'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'RLS_TEST_SUPABASE_SERVICE_ROLE_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'RLS_TEST_SUPABASE_ANON_KEY'],
  ] as const)('rejects application credentials reused across %s and %s', (applicationKey, testKey) => {
    expect(() => getRlsTestEnvironment({
      ...applicationEnv,
      ...testEnv,
      [applicationKey]: `  ${testEnv[testKey]}  `,
    })).toThrow('Wymagane są osobne klucze testowe');
  });

  it('a missing RLS environment fails before a helper creates any Supabase client', async () => {
    for (const key of Object.keys(testEnv)) vi.stubEnv(key, undefined);
    for (const [key, value] of Object.entries(applicationEnv)) vi.stubEnv(key, value);
    await expect(createUserScopedClient('user-id')).rejects.toThrow('RLS_TEST_SUPABASE_URL');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([
    { RLS_TEST_ALLOW_DESTRUCTIVE: 'true' },
    { RLS_TEST_SUPABASE_URL: 'https://production.example.test' },
    { NEXT_PUBLIC_SUPABASE_URL: testEnv.RLS_TEST_SUPABASE_URL },
    { SUPABASE_SERVICE_ROLE_KEY: testEnv.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY },
  ])('an unsafe configuration fails before a helper creates any Supabase client: %j', async (overrides) => {
    for (const [key, value] of Object.entries({ ...applicationEnv, ...testEnv, ...overrides })) {
      vi.stubEnv(key, value);
    }
    await expect(createUserScopedClient('user-id')).rejects.toThrow();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
