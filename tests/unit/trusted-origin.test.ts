import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getTrustedAppOrigin } from '@/lib/auth/trusted-origin';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  undefined, '', 'example.test', '//example.test', 'ftp://example.test',
  'https://user:pass@example.test', 'https://@example.test',
  'https://example.test/path', 'https://example.test/./', 'https://example.test//',
  'https://example.test?', 'https://example.test#', 'https://example.test/?x=1',
  'https://example.test/#top', ' https://example.test', 'https://example.test ',
  'https://example.test\n', 'https://exam\tple.test',
  'https://example.test\\anything', 'https://example.test:invalid',
  'https://example.test/../', 'http://example.test', 'http://localhost:3000',
])('rejects absent or unsafe configuration %s', (value) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', value);
  expect(getTrustedAppOrigin()).toBeNull();
});
it.each([
  ['https://app.example.test', 'https://app.example.test'],
  ['HTTPS://APP.EXAMPLE.TEST:443/', 'https://app.example.test'],
  ['https://app.example.test:8443/', 'https://app.example.test:8443'],
])('normalizes only the configured HTTPS origin %s', (value, expected) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', value);
  expect(getTrustedAppOrigin()).toBe(expected);
});
it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000'])('permits HTTP %s only in explicit local development', (host) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://' + host + '/');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
  expect(getTrustedAppOrigin()).toBeNull();
  vi.stubEnv('NODE_ENV', 'development');
  expect(getTrustedAppOrigin()).toBe('http://' + host);
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
  expect(getTrustedAppOrigin()).toBeNull();
});
it.each(['app.example.test', 'localhost.evil.test', '127.0.0.2', '0.0.0.0'])('does not permit development HTTP on %s', (host) => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://' + host);
  expect(getTrustedAppOrigin()).toBeNull();
});
// Native environment variables cannot contain NUL; cover observable control characters.
it.each([1, 9, 10, 13, 31, 127, 128, 159])('rejects control character %i in an origin', (code) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example' + String.fromCharCode(code) + '.test');
  expect(getTrustedAppOrigin()).toBeNull();
});
