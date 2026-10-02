import { constants, createHash, createPublicKey, generateKeyPairSync, verify, type KeyObject } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { assertRsaOfflineKeyLength, certificateVerificationUrlForOfflineInvoice } from '@/lib/ksef/qr-codes';

const HASH_HEX = createHash('sha256').update('<Faktura>test</Faktura>', 'utf8').digest('hex');
const HASH_B64URL = Buffer.from(HASH_HEX, 'hex').toString('base64url');
const SERIAL = '01F20A5D352AE590';

function input(privateKeyPem: string) {
  return {
    env: 'test' as const,
    contextNip: '1234567890',
    sellerNip: '1234567890',
    certificateSerialNumber: SERIAL,
    sha256Hex: HASH_HEX,
    privateKeyPem,
  };
}

function splitSignedUrl(url: string): { signedPart: string; signature: Buffer } {
  const withoutScheme = url.slice('https://'.length);
  const lastSlash = withoutScheme.lastIndexOf('/');
  return {
    signedPart: withoutScheme.slice(0, lastSlash),
    signature: Buffer.from(withoutScheme.slice(lastSlash + 1), 'base64url'),
  };
}

describe('KSeF KOD II — link certyfikatu Offline', () => {
  it('podpisuje dokładną ścieżkę MF algorytmem RSA-PSS/SHA-256 z solą 32 B', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const url = certificateVerificationUrlForOfflineInvoice(input(pem));
    const { signedPart, signature } = splitSignedUrl(url);

    expect(signedPart).toBe(`qr-test.ksef.mf.gov.pl/certificate/Nip/1234567890/1234567890/${SERIAL}/${HASH_B64URL}`);
    expect(url).toMatch(/^https:\/\/qr-test\.ksef\.mf\.gov\.pl\/certificate\/.+\/[A-Za-z0-9_-]+$/);
    expect(signature).toHaveLength(256);
    expect(verify('sha256', Buffer.from(signedPart), {
      key: createPublicKey(privateKey),
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    }, signature)).toBe(true);
    expect(verify('sha256', Buffer.from(`${signedPart}/`), {
      key: createPublicKey(privateKey),
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    }, signature)).toBe(false);
  });

  it('podpisuje host produkcyjny algorytmem P-256/SHA-256 w IEEE P1363', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const url = certificateVerificationUrlForOfflineInvoice({ ...input(pem), env: 'production' });
    const { signedPart, signature } = splitSignedUrl(url);

    expect(signedPart).toBe(`qr.ksef.mf.gov.pl/certificate/Nip/1234567890/1234567890/${SERIAL}/${HASH_B64URL}`);
    expect(signature).toHaveLength(64);
    expect(verify('sha256', Buffer.from(signedPart), {
      key: createPublicKey(privateKey),
      dsaEncoding: 'ieee-p1363',
    }, signature)).toBe(true);
  });

  it('odrzuca błędne dane i niewłaściwe klucze bez zastępczego podpisu', () => {
    const rsa2048 = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const ec384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey;
    const pem = (key: KeyObject) => key.export({ type: 'pkcs8', format: 'pem' }).toString();
    const base = input(pem(rsa2048));

    expect(() => assertRsaOfflineKeyLength(1024)).toThrow('2048');
    expect(() => assertRsaOfflineKeyLength(undefined)).toThrow('2048');
    expect(() => assertRsaOfflineKeyLength(2048)).not.toThrow();
    expect(() => certificateVerificationUrlForOfflineInvoice(input(pem(ec384)))).toThrow('P-256');
    expect(() => certificateVerificationUrlForOfflineInvoice({ ...base, privateKeyPem: 'not a key' })).toThrow();
    expect(() => certificateVerificationUrlForOfflineInvoice({ ...base, contextNip: '1234567890/evil' })).toThrow('NIP');
    expect(() => certificateVerificationUrlForOfflineInvoice({ ...base, certificateSerialNumber: '../evil' })).toThrow('seryjny');
    expect(() => certificateVerificationUrlForOfflineInvoice({ ...base, sha256Hex: 'abc' })).toThrow('SHA-256');
  });
});
