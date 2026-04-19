import { createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes, constants, type KeyObject } from 'node:crypto';
import { ksefFetch } from './client';
import type { PublicKeyCertificatesResponse, PublicKeyCertificateUsage } from '@/types/ksef';

/**
 * Dane szyfrowania sesji KSeF.
 * Te wartości PRZESYŁAMY w OpenOnlineSessionRequest.
 */
export interface SessionEncryption {
  /** AES-256 key zaszyfrowany RSA-OAEP SHA-256, Base64 */
  encryptedSymmetricKey: string;
  /** Initialization Vector dla AES, Base64 */
  initializationVector: string;
  /** Surowy AES key (NIE wysyłamy - zapamiętujemy lokalnie do szyfrowania faktur) */
  symmetricKey: Buffer;
  /** Surowy IV */
  iv: Buffer;
}

/**
 * Cache publicznych kluczy MF per usage (refreshowany co 24h).
 * KSeF publikuje osobne klucze dla:
 * - 'SymmetricKeyEncryption' - szyfrowanie klucza AES sesji
 * - 'KsefTokenEncryption'    - szyfrowanie tokena KSeF przy autentykacji
 */
const keyCache = new Map<PublicKeyCertificateUsage, { key: KeyObject; expiry: number }>();

/**
 * Owija goły DER Base64 w PEM, bo Node's createPublicKey() lubi oba formaty,
 * ale PEM łatwiej diagnozować.
 */
function derBase64ToPem(derBase64: string): string {
  const lines = derBase64.match(/.{1,64}/g) ?? [derBase64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

async function getKsefPublicKey(usage: PublicKeyCertificateUsage): Promise<KeyObject> {
  const now = Date.now();
  const cached = keyCache.get(usage);
  if (cached && cached.expiry > now) {
    return cached.key;
  }

  const response = await ksefFetch<PublicKeyCertificatesResponse>(
    '/security/public-key-certificates'
  );

  if (!Array.isArray(response)) {
    throw new Error('KSeF: nieoczekiwany kształt odpowiedzi /security/public-key-certificates');
  }

  const certEntry = response.find((c) => c.usage?.includes(usage));

  if (!certEntry) {
    const available = response.map((c) => c.usage).flat();
    throw new Error(
      `KSeF: brak certyfikatu o usage=${usage} w odpowiedzi (dostępne: ${available.join(', ')})`
    );
  }

  const pem = derBase64ToPem(certEntry.certificate);
  const publicKey = createPublicKey(pem);

  keyCache.set(usage, {
    key: publicKey,
    expiry: now + 24 * 60 * 60 * 1000,
  });

  return publicKey;
}

/**
 * Szyfruje string tokenem KSeF kluczem RSA-OAEP-SHA256.
 * Używane w autentykacji przez token: szyfrujemy `${token}|${timestampMs}`.
 */
export async function encryptKsefToken(plaintext: string): Promise<string> {
  const publicKey = await getKsefPublicKey('KsefTokenEncryption');
  const encrypted = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(plaintext, 'utf8')
  );
  return encrypted.toString('base64');
}

/**
 * Generuje nowy zestaw kluczy dla sesji KSeF.
 * Wywołać RAZ na sesję.
 */
export async function generateSessionEncryption(): Promise<SessionEncryption> {
  // 1. Losowy AES-256 key i 16-byte IV
  const symmetricKey = randomBytes(32); // 256 bit
  const iv = randomBytes(16);

  // 2. Pobierz public key MF (osobny klucz dla klucza symetrycznego)
  const ksefPublicKey = await getKsefPublicKey('SymmetricKeyEncryption');

  // 3. Zaszyfruj AES key przez RSA-OAEP SHA-256 MGF1-SHA256
  const encryptedSymmetricKey = publicEncrypt(
    {
      key: ksefPublicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    symmetricKey
  );

  return {
    encryptedSymmetricKey: encryptedSymmetricKey.toString('base64'),
    initializationVector: iv.toString('base64'),
    symmetricKey,
    iv,
  };
}

/**
 * Szyfruje XML faktury kluczem sesji (AES-256-CBC).
 * Zwraca zaszyfrowany ciało (Base64) i SHA-256 hash nieszyfrowanego XML-a.
 */
export interface EncryptedInvoicePayload {
  /** SHA-256 hash oryginalnego XML (niezaszyfrowanego), Base64. */
  invoiceHash: string;
  /** Rozmiar oryginalnego XML w bajtach UTF-8. */
  invoiceSize: number;
  /** SHA-256 hash zaszyfrowanego body (bytes przed Base64), Base64. */
  encryptedInvoiceHash: string;
  /** Rozmiar zaszyfrowanego body w bajtach (bytes przed Base64). */
  encryptedInvoiceSize: number;
  /** Zaszyfrowana treść XML FA(3), Base64. */
  encryptedInvoiceContent: string;
}

export function encryptInvoiceXml(
  xmlContent: string,
  encryption: SessionEncryption,
): EncryptedInvoicePayload {
  // Hash + rozmiar ORYGINALNEGO XML (bytes UTF-8, nie znaki).
  const xmlBytes = Buffer.from(xmlContent, 'utf8');
  const invoiceHash = createHash('sha256').update(xmlBytes).digest('base64');

  // Szyfrowanie AES-256-CBC z PKCS7 padding (domyślne w Node.js).
  const cipher = createCipheriv('aes-256-cbc', encryption.symmetricKey, encryption.iv);
  const encryptedBytes = Buffer.concat([cipher.update(xmlBytes), cipher.final()]);

  // KSeF wymaga hash + size zaszyfrowanego body wg RAW BYTES (przed base64),
  // żeby po stronie serwera móc zweryfikować integralność przed dekryptacją.
  const encryptedInvoiceHash = createHash('sha256').update(encryptedBytes).digest('base64');

  return {
    invoiceHash,
    invoiceSize: xmlBytes.length,
    encryptedInvoiceHash,
    encryptedInvoiceSize: encryptedBytes.length,
    encryptedInvoiceContent: encryptedBytes.toString('base64'),
  };
}
