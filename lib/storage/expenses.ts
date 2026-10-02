// Storage dla zdjęć faktur kosztowych w R2

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedInvoiceUrl } from '@/lib/storage/r2';
import { assertTenantStoragePath } from '@/lib/storage/tenant-path';
import { getR2Client, getR2Config } from '@/lib/storage/r2-client';

/**
 * Sukcesywnie zbiera Body z GetObject jako bufor binarny (jak w `lib/storage/r2.ts`).
 */
async function streamBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error('R2: empty response body');

  if (
    typeof (body as { transformToByteArray?: () => Promise<Uint8Array> })
      .transformToByteArray === 'function'
  ) {
    const arr = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(arr);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Typ pliku kosztu z ZAWARTOŚCI (sygnatury), nie z nagłówka przeglądarki —
 * tylko formaty, które czyta OCR (`lib/ocr/engine.ts`). `null` = plik
 * odrzucamy (AUD-105: do 02.10 zapis przyjmował dowolny plik z typem
 * podanym przez klienta).
 */
export type ExpensePhotoMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf';

export function detectExpensePhotoType(bytes: Uint8Array): ExpensePhotoMime | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && ascii(1, 4) === 'PNG' &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function expensePhotoExtension(mimeType: string): string {
  const sub = mimeType.split('/')[1]?.toLowerCase() ?? 'bin';
  return sub.replace(/^jpeg$/, 'jpg');
}

/**
 * Upload zdjęcia faktury kosztowej.
 * Path: tenants/{tenantId}/expenses/{yyyy}/{mm}/{ocrJobId}.{ext}
 */
export async function uploadExpensePhoto(
  tenantId: string,
  ocrJobId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const ext = expensePhotoExtension(mimeType);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const key = `tenants/${tenantId}/expenses/${yyyy}/${mm}/${ocrJobId}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'private, no-store',
    })
  );

  return key;
}

/**
 * Wygeneruj signed URL do podglądu zdjęcia (1h ważności).
 */
export async function getExpensePhotoUrl(key: string, tenantId: string): Promise<string> {
  return getSignedInvoiceUrl(key, tenantId, 3600);
}

/**
 * Pobierz zdjęcie jako Buffer (dla OCR).
 */
export async function downloadExpensePhoto(
  key: string,
  tenantId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  assertTenantStoragePath(key, tenantId);
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const result = await client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: key })
  );

  if (!result.Body) {
    throw new Error(`R2: empty body for expense photo: ${key}`);
  }

  const buffer = await streamBodyToBuffer(result.Body);
  return {
    buffer,
    mimeType: result.ContentType ?? 'image/jpeg',
  };
}

export async function deleteExpensePhoto(key: string): Promise<void> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: key })
  );
}
