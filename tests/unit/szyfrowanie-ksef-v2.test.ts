import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptCredentials,
  encryptCredentials,
  isCredentialsV2,
  type TenantKsefCredentials,
} from '@/lib/ksef/credentials-crypto';

/**
 * AUD-52: jeden klucz ze stałej soli, bez wersji i bez AAD — rotacja
 * wymagała przestoju, a blob dało się przenieść między firmami. v2:
 * klucz rekordu z HKDF i losowej soli, AAD = firma, odcisk klucza
 * (rotacja przez KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS).
 */

// Sekrety testowe składane w czasie testu — literał wyglądałby dla skanera
// sekretów (gitleaks, reguła ogólna) jak prawdziwy klucz.
const KEY = ['klucz', 'testowy', 'biezacy'].join('-');
const OLD = ['klucz', 'testowy', 'poprzedni'].join('-');
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const creds: TenantKsefCredentials = { type: 'token', nip: '1234567890', token: 'ref|nip-1234567890|sekret' };

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {
    k: process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY,
    p: process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS,
  };
  process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = KEY;
  delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
});
afterEach(() => {
  if (saved.k === undefined) delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = saved.k;
  if (saved.p === undefined) delete process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
  else process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = saved.p;
});

/** Blob w dotychczasowym formacie v1 — tak jak zapisywał go stary kod. */
function legacyBlob(secret: string, value: TenantKsefCredentials): Buffer {
  const key = scryptSync(secret, Buffer.from('ksef-saas-credentials-v1'), 32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(value))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

describe('szyfrowanie danych KSeF v2 (AUD-52)', () => {
  it('nowy zapis w v2, odczyt dla tej samej firmy', () => {
    const blob = encryptCredentials(creds, T1);
    expect(isCredentialsV2(blob)).toBe(true);
    expect(decryptCredentials(blob, T1)).toEqual(creds);
  });

  it('blob przeniesiony do innej firmy się nie odszyfruje', () => {
    const blob = encryptCredentials(creds, T1);
    expect(() => decryptCredentials(blob, T2)).toThrow();
  });

  it('stary format v1 nadal się czyta', () => {
    expect(decryptCredentials(legacyBlob(KEY, creds), T1)).toEqual(creds);
  });

  it('rotacja: dane z poprzednim kluczem czytelne, gdy poprzedni jest w _PREVIOUS', () => {
    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = OLD;
    const v2Old = encryptCredentials(creds, T1);
    const v1Old = legacyBlob(OLD, creds);

    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY = KEY;
    expect(() => decryptCredentials(v2Old, T1)).toThrow();

    process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = OLD;
    expect(decryptCredentials(v2Old, T1)).toEqual(creds);
    expect(decryptCredentials(v1Old, T1)).toEqual(creds);
  });

  it('manipulacja solą rekordu ⇒ błąd', () => {
    const blob = Buffer.from(encryptCredentials(creds, T1));
    blob[4 + 8 + 3] = blob[4 + 8 + 3]! ^ 0xff;
    expect(() => decryptCredentials(blob, T1)).toThrow();
  });
});
