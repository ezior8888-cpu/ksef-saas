import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Recovery codes dla 2FA — generowane przy enrollment TOTP.
 *
 * Alfabet bez ambiguous chars (0/O, 1/I/L) — łatwiej przepisać z kartki.
 *
 * Format: XXXXX-XXXXX (10 znaków + separator) — ~50 bitów entropii.
 * Nawet przy mass attack z dostępem do hash-bazy odgadnięcie jednego z 8
 * kodów = O(2^47) operacji scrypt, niewykonalne.
 *
 * Hash: scrypt N=2^14 (default w Node), 32-byte key, 16-byte salt per row.
 * Wystarczająco wolny żeby brute-force po wycieku był nierealistyczny,
 * wystarczająco szybki żeby login z recovery code był instant (~50ms).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 10;
const SALT_BYTES = 16;
const KEY_LEN = 32;
export const RECOVERY_CODE_COUNT = 8;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let code = '';
  for (const b of bytes) {
    code += ALPHABET[b % ALPHABET.length];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    generateRecoveryCode(),
  );
}

export interface HashedRecoveryCode {
  hash: string;
  salt: string;
}

export function hashRecoveryCode(code: string): HashedRecoveryCode {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(normalizeCode(code), salt, KEY_LEN);
  return { hash: hash.toString('hex'), salt: salt.toString('hex') };
}

export function verifyRecoveryCode(
  code: string,
  hashHex: string,
  saltHex: string,
): boolean {
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const salt = Buffer.from(saltHex, 'hex');
    const actual = scryptSync(normalizeCode(code), salt, KEY_LEN);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Akceptujemy code z/bez myślnika i case-insensitive — w stresie user
 * może źle przepisać. Normalize przed hash i verify.
 */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, '');
}
