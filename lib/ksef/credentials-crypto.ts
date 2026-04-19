import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Szyfruje credentials KSeF tenanta (cert + key PEM) przed zapisem do bazy.
 * Używa AES-256-GCM z losowym IV.
 *
 * Format wynikowy: [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = Buffer.from('ksef-saas-credentials-v1'); // stała aplikacyjna

function getKey(): Buffer {
  const secret = process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('KSEF_CREDENTIALS_ENCRYPTION_KEY nie jest ustawione w .env');
  }
  // scrypt zapewnia deterministyczne wyprowadzenie klucza z hasła
  return scryptSync(secret, SALT, 32);
}

export interface TenantKsefCredentials {
  nip: string;
  certificatePem: string;
  privateKeyPem: string;
}

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

  return JSON.parse(decrypted.toString('utf8')) as TenantKsefCredentials;
}
