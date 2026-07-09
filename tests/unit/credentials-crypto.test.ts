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
    const blob = encryptCredentials(xadesCreds);
    expect(decryptCredentials(blob)).toEqual(xadesCreds);
  });

  it('round-trip token — bez utraty danych', () => {
    const blob = encryptCredentials(tokenCreds);
    expect(decryptCredentials(blob)).toEqual(tokenCreds);
  });

  it('ciphertext NIE zawiera plaintextu tokenu', () => {
    const blob = encryptCredentials(tokenCreds);
    expect(blob.toString('utf8')).not.toContain('super-secret-token-value');
    expect(blob.toString('latin1')).not.toContain('super-secret-token-value');
  });

  it('ten sam plaintext ⇒ różny blob (losowy IV)', () => {
    const a = encryptCredentials(tokenCreds);
    const b = encryptCredentials(tokenCreds);
    expect(a.equals(b)).toBe(false);
    // ale oba deszyfrują się do tego samego
    expect(decryptCredentials(a)).toEqual(decryptCredentials(b));
  });

  it('tamper ciphertextu ⇒ decrypt rzuca (GCM auth tag)', () => {
    const blob = encryptCredentials(tokenCreds);
    const tampered = Buffer.from(blob);
    // przekręć ostatni bajt ciphertextu
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it('tamper auth tagu ⇒ decrypt rzuca', () => {
    const blob = encryptCredentials(tokenCreds);
    const tampered = Buffer.from(blob);
    // auth tag siedzi w bajtach 12..28 (po 12-bajtowym IV)
    tampered[14] = tampered[14]! ^ 0xff;
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it('zły klucz ⇒ decrypt rzuca (nie odszyfruje cudzych danych)', () => {
    const blob = encryptCredentials(tokenCreds);
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = 'zupelnie-inny-klucz-deszyfrujacy';
    expect(() => decryptCredentials(blob)).toThrow();
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY; // przywróć
  });

  it('brak klucza ⇒ encrypt rzuca czytelny błąd', () => {
    delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptCredentials(tokenCreds)).toThrow(/KSEF_CREDENTIALS_ENCRYPTION_KEY/);
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
  });
});
