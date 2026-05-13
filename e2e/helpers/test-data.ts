/**
 * Stałe dane testowe. NIP-y celowo fikcyjne (KSeF test env) — zgodnie z
 * AGENTS.md (KSEF_ENV=test). Wszystkie domeny w `.test` lub `example.com`,
 * żeby przypadkiem nie trafiło do prawdziwej skrzynki przy nieudanym mocku.
 */

export const TEST_NIP_SELLER = '1234567890';
export const TEST_NIP_BUYER = '9876543210';
export const TEST_NIP_EU = 'DE123456789';

export const TEST_PASSWORD = 'E2ePass2026!Strong';

export const TEST_COMPANY = {
  name: 'E2E Test Sp. z o.o.',
  nip: TEST_NIP_SELLER,
  street: 'ul. Testowa 1',
  city: 'Warszawa',
  postalCode: '00-001',
  country: 'PL',
  bankAccount: '12 1020 1026 0000 0102 0000 0001',
} as const;

export const TEST_BUYER = {
  name: 'Klient Testowy Sp. z o.o.',
  nip: TEST_NIP_BUYER,
  street: 'ul. Klienta 5',
  city: 'Kraków',
  postalCode: '30-001',
  country: 'PL',
} as const;

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ksef-saas.test`;
}

export function uniqueInvoiceNumber(): string {
  return `FV/E2E/${Date.now()}`;
}

export const KSEF_MOCK_REFERENCE = '20260512-TEST-REF-0001';
export const KSEF_MOCK_NUMBER = '1234567890-20260512-AAAAAA000001-AB';
