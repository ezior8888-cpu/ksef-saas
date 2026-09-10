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
    expect(() => getRlsTestEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'https://application.example.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'app-anon-do-not-use',
      SUPABASE_SERVICE_ROLE_KEY: 'app-service-do-not-use',
    })).toThrow('RLS_TEST_SUPABASE_URL, RLS_TEST_SUPABASE_ANON_KEY, RLS_TEST_SUPABASE_SERVICE_ROLE_KEY');
  });

  it('rejects each missing or whitespace-only explicit parameter', () => {
    for (const key of Object.keys(testEnv)) {
      expect(() => getRlsTestEnvironment({ ...testEnv, [key]: undefined })).toThrow(key);
      expect(() => getRlsTestEnvironment({ ...testEnv, [key]: '   ' })).toThrow(key);
    }
  });

  it('accepts an explicitly configured test database', () => {
    expect(getRlsTestEnvironment(testEnv)).toEqual({
      url: testEnv.RLS_TEST_SUPABASE_URL,
      anonKey: testEnv.RLS_TEST_SUPABASE_ANON_KEY,
      serviceRoleKey: testEnv.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY,
    });
  });

  it('rejects malformed URLs without reflecting credentials in errors', () => {
    for (const url of ['not-a-url', 'file:///tmp/db', 'https://user:secret@example.test', 'https://example.test/?key=secret']) {
      let message = '';
      try { getRlsTestEnvironment({ ...testEnv, RLS_TEST_SUPABASE_URL: url }); }
      catch (error) { message = (error as Error).message; }
      expect(message).toContain('RLS_TEST_SUPABASE_URL');
      expect(message).not.toContain('secret');
    }
  });

  it('a missing RLS environment fails before a helper creates any Supabase client', async () => {
    for (const key of Object.keys(testEnv)) vi.stubEnv(key, undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://application.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'application-anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'application-service');
    await expect(createUserScopedClient('user-id')).rejects.toThrow('RLS_TEST_SUPABASE_URL');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
