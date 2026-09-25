import { expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

it.each([
  null, undefined, '', 'https://outside.example.test', '//outside.example.test',
  'javascript:alert(1)', 'data:text/html,fixture', 'dashboard',
  '/\\outside.example.test', '/inside\\path', '/\t/outside.example.test',
  '/a/..//outside.example.test', '/a/%2e%2e//outside.example.test',
  '/%2foutside.example.test', '/%5coutside.example.test', '/a/..%2f%2foutside.example.test',
  '/%00unsafe', '/path%0d%0a', '/bad%encoding', '/%C2%80',
])('rejects unsafe or absent destination %s', (value) => {
  expect(safeRedirectPath(value)).toBe('/dashboard');
});
it.each([
  ['/dashboard', '/dashboard'], ['/reset-password', '/reset-password'],
  ['/invoices?status=paid&page=2', '/invoices?status=paid&page=2'],
  ['/invite/fixture-token?mode=accept', '/invite/fixture-token?mode=accept'],
  ['/onboarding?mode=join', '/onboarding?mode=join'],
  ['/search?q=https%3A%2F%2Fexample.test%2F&next=%2Finvoices', '/search?q=https%3A%2F%2Fexample.test%2F&next=%2Finvoices'],
  ['/search?q=https://example.test/', '/search?q=https://example.test/'],
  ['/report#summary', '/report#summary'], ['/folder/a%20b', '/folder/a%20b'],
  ['/a/../invoices', '/invoices'],
])('preserves a canonical internal destination %s', (value, expected) => {
  expect(safeRedirectPath(value)).toBe(expected);
});
it.each([
  ...Array.from({ length: 32 }, (_, index) => index),
  ...Array.from({ length: 33 }, (_, index) => index + 127),
])('rejects C0/C1 character %i anywhere in a path or query', (code) => {
  const character = String.fromCharCode(code);
  expect(safeRedirectPath('/' + character + '/outside.example.test')).toBe('/dashboard');
  expect(safeRedirectPath('/safe?value=' + character)).toBe('/dashboard');
});
