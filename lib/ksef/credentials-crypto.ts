import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Szyfruje credentials KSeF tenanta przed zapisem do `tenants.ksef_credentials_encrypted`.
 * Używa AES-256-GCM z losowym IV.
 *
 * Format blob (little-endian po bajtach):
 *   [12 bytes IV][16 bytes auth tag][N bytes ciphertext(JSON)]
 *
 * TenantKsefCredentials to discriminated union po `type`:
 *   - 'xades' - klasyczna para cert+key z pliku .pem (legacy, silniejsze uwierzytelnienie)
 *   - 'token' - long-lived token wygenerowany w portalu ap-test.ksef.mf.gov.pl
 *     (mniej silne: jeden stringin KSeF ma zapisany, brak PKI)
 *
 * `decryptCredentials` zwraca union - caller dispatcha po `type` (w `admin-queries.ts`
 * zamieniamy to na `KsefAuth` dla submit-invoice-full).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = Buffer.from('ksef-saas-credentials-v1'); // stała aplikacyjna - BYPASS rotacji

function getKey(): Buffer {
  const secret = process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('KSEF_CREDENTIALS_ENCRYPTION_KEY nie jest ustawione w .env');
  }
  // scrypt zapewnia deterministyczne wyprowadzenie klucza z hasła.
  return scryptSync(secret, SALT, 32);
}

// ═══════════════════════════════════════════════════════════════
// TYPY
// ═══════════════════════════════════════════════════════════════

export interface TenantKsefXadesCredentials {
  type: 'xades';
  nip: string;
  certificatePem: string;
  privateKeyPem: string;
}

export interface TenantKsefTokenCredentials {
  type: 'token';
  nip: string;
  /** Long-lived token (format KSeF: `reference|nip-NIP|secret`). */
  token: string;
}

export type TenantKsefCredentials =
  | TenantKsefXadesCredentials
  | TenantKsefTokenCredentials;

// ═══════════════════════════════════════════════════════════════
// SZYFROWANIE
// ═══════════════════════════════════════════════════════════════

export function encryptCredentials(creds: TenantKsefCredentials): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = Buffer.from(JSON.stringify(creds), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptCredentials(encryptedBlob: Buffer): TenantKsefCredentials {
  const key = getKey();
  const iv = encryptedBlob.subarray(0, IV_LENGTH);
  const authTag = encryptedBlob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBlob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const parsed = JSON.parse(decrypted.toString('utf8')) as TenantKsefCredentials;

  // Defensywna walidacja - jeśli kiedyś zmienimy kształt, stare rekordy będą
  // wymagały migracji, a nie silent corruption.
  if (parsed.type !== 'xades' && parsed.type !== 'token') {
    throw new Error(
      `decryptCredentials: nieznany type "${(parsed as { type?: unknown }).type}"`,
    );
  }
  return parsed;
}
