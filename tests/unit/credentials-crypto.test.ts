import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decryptCredentials,
  encryptCredentials,
  type TenantKsefCredentials,
} from '@/lib/ksef/credentials-crypto';

/**
 * TEST-5 (audyt przedlaunchowy): szyfrowanie credentials KSeF (AES-256-GCM).
 * To chroni token autoryzacyjny / klucz prywatny tenanta w bazie. Krytyczne:
 * (a) round-trip nie gubi danych; (b) GCM wykrywa manipulację ciphertextem
 * (tamper); (c) ten sam plaintext daje różny blob (losowy IV).
 */

const TEST_KEY = 'test-encryption-key-aes256-gcm-deterministic-via-scrypt';
/** Od formatu v2 (AUD-52) firma jest częścią szyfrowania (AAD). */
const TENANT = '11111111-1111-4111-8111-111111111111';

const xadesCreds: TenantKsefCredentials = {
  type: 'xades',
  nip: '5260001246',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB...fake...\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE...fake...\n-----END PRIVATE KEY-----',
};

const tokenCreds: TenantKsefCredentials = {
  type: 'token',
  nip: '5260001246',
  token: 'reference|nip-5260001246|super-secret-token-value',
};

describe('credentials-crypto (AES-256-GCM)', () => {
  let savedKey: string | undefined;

  beforeAll(() => {
    savedKey = process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  it('round-trip xades — bez utraty danych', () => {
    const blob = encryptCredentials(xadesCreds, TENANT);
    expect(decryptCredentials(blob, TENANT)).toEqual(xadesCreds);
  });

  it('round-trip token — bez utraty danych', () => {
    const blob = encryptCredentials(tokenCreds, TENANT);
    expect(decryptCredentials(blob, TENANT)).toEqual(tokenCreds);
  });

  it('ciphertext NIE zawiera plaintextu tokenu', () => {
    const blob = encryptCredentials(tokenCreds, TENANT);
    expect(blob.toString('utf8')).not.toContain('super-secret-token-value');
    expect(blob.toString('latin1')).not.toContain('super-secret-token-value');
  });

  it('ten sam plaintext ⇒ różny blob (losowy IV)', () => {
    const a = encryptCredentials(tokenCreds, TENANT);
    const b = encryptCredentials(tokenCreds, TENANT);
    expect(a.equals(b)).toBe(false);
    // ale oba deszyfrują się do tego samego
    expect(decryptCredentials(a, TENANT)).toEqual(decryptCredentials(b, TENANT));
  });

  it('tamper ciphertextu ⇒ decrypt rzuca (GCM auth tag)', () => {
    const blob = encryptCredentials(tokenCreds, TENANT);
    const tampered = Buffer.from(blob);
    // przekręć ostatni bajt ciphertextu
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(() => decryptCredentials(tampered, TENANT)).toThrow();
  });

  it('tamper auth tagu ⇒ decrypt rzuca', () => {
    const blob = encryptCredentials(tokenCreds, TENANT);
    const tampered = Buffer.from(blob);
    // v2: tag GCM siedzi po nagłówku (4 B znacznik + 8 B odcisk + 16 B sól + 12 B IV)
    tampered[4 + 8 + 16 + 12 + 2] = tampered[4 + 8 + 16 + 12 + 2]! ^ 0xff;
    expect(() => decryptCredentials(tampered, TENANT)).toThrow();
  });

  it('zły klucz ⇒ decrypt rzuca (nie odszyfruje cudzych danych)', () => {
    const blob = encryptCredentials(tokenCreds, TENANT);
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = 'zupelnie-inny-klucz-deszyfrujacy';
    expect(() => decryptCredentials(blob, TENANT)).toThrow();
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY; // przywróć
  });

  it('brak klucza ⇒ encrypt rzuca czytelny błąd', () => {
    delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptCredentials(tokenCreds, TENANT)).toThrow(/KSEF_CREDENTIALS_ENCRYPTION_KEY/);
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
  });
});
