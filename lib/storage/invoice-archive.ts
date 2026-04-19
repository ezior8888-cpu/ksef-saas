import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getR2Client, getR2Config } from './r2-client';

/**
 * Layout w R2:
 *
 *   <tenantId>/<YYYY>/<MM>/<ksefNumber>/invoice.xml   - faktura (niezmienna)
 *   <tenantId>/<YYYY>/<MM>/<ksefNumber>/upo.xml       - UPO (niezmienne)
 *
 * Klucz jest deterministyczny po numerze KSeF - jeśli ktoś spróbuje nadpisać,
 * pójdzie PUT z IfNoneMatch (precondition), który R2 respektuje.
 *
 * tenantId = supabase user_id lub tenant_id z organizations - tak żebyśmy
 * mogli w przyszłości skonfigurować per-tenant signed URLs / IAM scope.
 */

export interface ArchiveKey {
  tenantId: string;
  ksefNumber: string;
  /** Opcjonalna data wystawienia - używana do foldera YYYY/MM. Domyślnie: now(). */
  issueDate?: Date;
}

export interface ArchivedInvoice {
  invoiceKey: string;
  upoKey: string;
  etag: {
    invoice: string;
    upo: string;
  };
  sizeBytes: {
    invoice: number;
    upo: number;
  };
}

function buildKeyPrefix(key: ArchiveKey): string {
  const date = key.issueDate ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${key.tenantId}/${year}/${month}/${key.ksefNumber}`;
}

function invoiceObjectKey(key: ArchiveKey): string {
  return `${buildKeyPrefix(key)}/invoice.xml`;
}

function upoObjectKey(key: ArchiveKey): string {
  return `${buildKeyPrefix(key)}/upo.xml`;
}

/**
 * Zapisuje parę XML faktury + XML UPO do R2.
 *
 * Używa IfNoneMatch='*' żeby zablokować nadpisanie istniejącego klucza -
 * faktury w KSeF są immutable, więc każdy PUT w istniejący klucz byłby bugiem.
 *
 * Jeśli klucz już istnieje, R2 zwróci PreconditionFailed - rzucamy czytelny
 * błąd z sugestią.
 */
export async function archiveInvoice(params: {
  key: ArchiveKey;
  invoiceXml: string;
  upoXml: string;
  /** Dodatkowe metadane zapisywane jako x-amz-meta-* (max 2KB per obiekt). */
  metadata?: Record<string, string>;
}): Promise<ArchivedInvoice> {
  const { key, invoiceXml, upoXml, metadata } = params;
  const client = getR2Client();
  const { bucketName } = getR2Config();

  const invoiceKey = invoiceObjectKey(key);
  const upoKey = upoObjectKey(key);

  const commonMeta = {
    'ksef-number': key.ksefNumber,
    'tenant-id': key.tenantId,
    ...metadata,
  };

  const [invoiceResult, upoResult] = await Promise.all([
    client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: invoiceKey,
        Body: invoiceXml,
        ContentType: 'application/xml; charset=utf-8',
        IfNoneMatch: '*',
        Metadata: { ...commonMeta, 'document-type': 'invoice' },
      }),
    ),
    client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: upoKey,
        Body: upoXml,
        ContentType: 'application/xml; charset=utf-8',
        IfNoneMatch: '*',
        Metadata: { ...commonMeta, 'document-type': 'upo' },
      }),
    ),
  ]);

  return {
    invoiceKey,
    upoKey,
    etag: {
      invoice: invoiceResult.ETag ?? '',
      upo: upoResult.ETag ?? '',
    },
    sizeBytes: {
      invoice: Buffer.byteLength(invoiceXml, 'utf-8'),
      upo: Buffer.byteLength(upoXml, 'utf-8'),
    },
  };
}

/**
 * Pobiera XML faktury jako string. Zwraca `null`, jeśli klucz nie istnieje.
 */
export async function getInvoiceXml(key: ArchiveKey): Promise<string | null> {
  return readObjectAsString(invoiceObjectKey(key));
}

export async function getUpoXml(key: ArchiveKey): Promise<string | null> {
  return readObjectAsString(upoObjectKey(key));
}

async function readObjectAsString(objectKey: string): Promise<string | null> {
  const client = getR2Client();
  const { bucketName } = getR2Config();

  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: objectKey }),
    );
    const body = await result.Body?.transformToString('utf-8');
    return body ?? null;
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

/**
 * Sprawdza tylko istnienie obiektu bez pobierania treści (HEAD request).
 */
export async function invoiceExists(key: ArchiveKey): Promise<boolean> {
  const client = getR2Client();
  const { bucketName } = getR2Config();

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: invoiceObjectKey(key) }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error as { name?: string })?.name === 'NotFound'
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Zwraca signed URL do pobrania XML faktury (lub UPO).
 * Domyślnie 300 sekund - presigned URLs w R2 działają identycznie jak w S3.
 *
 * Używaj do endpointu "Pobierz PDF/XML" w dashboardzie - przekazujemy
 * URL do frontendu, użytkownik pobiera bezpośrednio z R2 (omija nasz bandwidth).
 */
export async function getSignedInvoiceUrl(
  key: ArchiveKey,
  options: { document?: 'invoice' | 'upo'; expiresInSeconds?: number } = {},
): Promise<string> {
  const { document = 'invoice', expiresInSeconds = 300 } = options;
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const objectKey = document === 'invoice' ? invoiceObjectKey(key) : upoObjectKey(key);

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName, Key: objectKey }),
    { expiresIn: expiresInSeconds },
  );
}

export interface ListedInvoice {
  ksefNumber: string;
  invoiceKey: string;
  upoKey: string;
  lastModified?: Date;
  sizeBytes?: number;
}

/**
 * Lista faktur w danym folderze YYYY/MM dla tenanta.
 * Do paginacji używaj continuationToken. Max 1000 per stronę (limit R2).
 */
export async function listInvoices(params: {
  tenantId: string;
  year: number;
  month?: number;
  continuationToken?: string;
  pageSize?: number;
}): Promise<{
  invoices: ListedInvoice[];
  continuationToken?: string;
}> {
  const { tenantId, year, month, continuationToken, pageSize = 100 } = params;
  const client = getR2Client();
  const { bucketName } = getR2Config();

  const monthSegment = month !== undefined ? `/${String(month).padStart(2, '0')}` : '';
  const prefix = `${tenantId}/${year}${monthSegment}/`;

  const result: ListObjectsV2CommandOutput = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: pageSize,
      ContinuationToken: continuationToken,
    }),
  );

  const byKsefNumber = new Map<
    string,
    { invoiceKey?: string; upoKey?: string; lastModified?: Date; size?: number }
  >();

  for (const obj of result.Contents ?? []) {
    if (!obj.Key) continue;
    const match = obj.Key.match(/\/([^/]+)\/(invoice|upo)\.xml$/);
    if (!match) continue;
    const [, ksefNumber, docType] = match;
    const bucket = byKsefNumber.get(ksefNumber) ?? {};
    if (docType === 'invoice') {
      bucket.invoiceKey = obj.Key;
      bucket.lastModified = obj.LastModified;
      bucket.size = obj.Size;
    } else {
      bucket.upoKey = obj.Key;
    }
    byKsefNumber.set(ksefNumber, bucket);
  }

  const invoices: ListedInvoice[] = [];
  for (const [ksefNumber, bucket] of byKsefNumber) {
    if (!bucket.invoiceKey) continue;
    invoices.push({
      ksefNumber,
      invoiceKey: bucket.invoiceKey,
      upoKey: bucket.upoKey ?? '',
      lastModified: bucket.lastModified,
      sizeBytes: bucket.size,
    });
  }

  return {
    invoices,
    continuationToken: result.IsTruncated ? result.NextContinuationToken : undefined,
  };
}

/**
 * Usuwa parę invoice + UPO. Używać WYŁĄCZNIE w testach lub do GDPR erasure
 * (a nawet wtedy tylko gdy dane nie podlegają obowiązkowi retencji VAT).
 *
 * W prod bucketach z Object Lock ta operacja i tak odrzuci R2.
 */
export async function deleteInvoice(key: ArchiveKey): Promise<void> {
  const client = getR2Client();
  const { bucketName } = getR2Config();

  await Promise.all([
    client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: invoiceObjectKey(key) }),
    ),
    client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: upoObjectKey(key) })),
  ]);
}
