// Storage dla zdjęć faktur kosztowych w R2

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedInvoiceUrl } from '@/lib/storage/r2';
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
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return key;
}

/**
 * Wygeneruj signed URL do podglądu zdjęcia (1h ważności).
 */
export async function getExpensePhotoUrl(key: string): Promise<string> {
  return getSignedInvoiceUrl(key, 3600);
}

/**
 * Pobierz zdjęcie jako Buffer (dla OCR).
 */
export async function downloadExpensePhoto(
  key: string
): Promise<{ buffer: Buffer; mimeType: string }> {
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
