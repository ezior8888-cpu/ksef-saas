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
import { createHash } from 'node:crypto';

import { getR2Client, getR2Config } from './r2-client';

/**
 * Warstwa operacji na obiektach R2 pod tabelę `xml_documents` w Supabase.
 *
 * Konwencja kluczy:
 *   {tenantId}/{YYYY}/{MM}/{invoiceId}.xml       - XML faktury
 *   {tenantId}/{YYYY}/{MM}/{invoiceId}.upo.xml   - UPO (dorzucamy po sukcesie KSeF)
 *
 * Dlaczego klucz po `invoiceId` (UUID z DB), a nie po `ksefNumber`:
 *   - XML trzeba zapisać ZANIM wyślemy do KSeF (audit trail draft/queued),
 *     a numer KSeF dostajemy dopiero po odpowiedzi z API.
 *   - invoiceId mapuje się 1:1 na wiersz `xml_documents`, więc kolumna
 *     `storage_path` pełni rolę naturalnego klucza.
 *
 * Klient S3 / konfiguracja endpointa (w tym jurisdiction EU/US/FedRAMP)
 * mieszka w `./r2-client.ts` - tu tylko operacje.
 */

// ═══════════════════════════════════════════════════════════════
// Helpery do budowy kluczy
// ═══════════════════════════════════════════════════════════════

function parseYearMonth(issueDate: string): { year: string; month: string } {
  // Zamiast polegać na split('-') akceptującym dowolne stringi, waliduj format.
  // To jest nie-gorszący bug: zły klucz = nie znajdziesz obiektu za pół roku.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new Error(
      `Invalid issueDate "${issueDate}": expected YYYY-MM-DD (ISO 8601 date)`,
    );
  }
  const [year, month] = issueDate.split('-');
  return { year, month };
}

function invoiceXmlKey(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
): string {
  const { year, month } = parseYearMonth(issueDate);
  return `${tenantId}/${year}/${month}/${invoiceId}.xml`;
}

function invoiceUpoKey(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
): string {
  const { year, month } = parseYearMonth(issueDate);
  return `${tenantId}/${year}/${month}/${invoiceId}.upo.xml`;
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) throw new Error('R2: empty response body');

  // AWS SDK v3 zwraca SdkStreamMixin z metodą transformToString w Node.js 18+.
  // Używamy jej, jeśli jest dostępna, bo obsługuje enkoding i backpressure
  // lepiej niż ręczny for-await.
  if (
    typeof (body as { transformToString?: (enc?: string) => Promise<string> })
      .transformToString === 'function'
  ) {
    return (body as { transformToString: (enc?: string) => Promise<string> })
      .transformToString('utf-8');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ═══════════════════════════════════════════════════════════════
// Publiczne API
// ═══════════════════════════════════════════════════════════════

export interface UploadXmlResult {
  /** Klucz w R2 - zapisz do xml_documents.storage_path. */
  storagePath: string;
  /** SHA-256 hex - zapisz do xml_documents.sha256_hash. */
  sha256Hash: string;
  /** Rozmiar zapisanego bufora w bajtach. */
  sizeBytes: number;
  /** ETag zwrócony przez R2 (MD5 w cudzysłowach) - przydatne do IfMatch. */
  etag: string;
}

export interface XmlUploadOptions {
  /**
   * Jeśli true, PUT idzie z `IfNoneMatch: '*'` - blokuje nadpisanie istniejącego
   * klucza. Używaj zawsze, chyba że świadomie chcesz replace (np. retry po
   * awarii PRZED pierwszym udanym zapisem do xml_documents).
   * Default: true.
   */
  immutable?: boolean;
  /** Dodatkowe metadane - trafiają jako x-amz-meta-* (max 2KB łącznie). */
  metadata?: Record<string, string>;
}

/**
 * Uploaduje XML faktury do R2.
 *
 * SHA-256 liczymy lokalnie zanim wyślemy, wkładamy w metadata i zwracamy -
 * nie polegamy na ETag (to MD5, a dla multipart to hash-of-hashes, bezużyteczny).
 */
export async function uploadInvoiceXml(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
  xmlContent: string,
  options: XmlUploadOptions = {},
): Promise<UploadXmlResult> {
  return uploadXmlDocument({
    key: invoiceXmlKey(tenantId, invoiceId, issueDate),
    body: xmlContent,
    tenantId,
    invoiceId,
    issueDate,
    documentType: 'invoice',
    options,
  });
}

/**
 * Uploaduje UPO faktury do R2 obok XML-a (ten sam folder, sufiks `.upo.xml`).
 * Wołać po pomyślnej wysyłce do KSeF i pobraniu UPO.
 */
export async function uploadInvoiceUpo(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
  upoXmlContent: string,
  options: XmlUploadOptions = {},
): Promise<UploadXmlResult> {
  return uploadXmlDocument({
    key: invoiceUpoKey(tenantId, invoiceId, issueDate),
    body: upoXmlContent,
    tenantId,
    invoiceId,
    issueDate,
    documentType: 'upo',
    options,
  });
}

async function uploadXmlDocument(params: {
  key: string;
  body: string;
  tenantId: string;
  invoiceId: string;
  issueDate: string;
  documentType: 'invoice' | 'upo';
  options: XmlUploadOptions;
}): Promise<UploadXmlResult> {
  const { key, body, tenantId, invoiceId, issueDate, documentType, options } = params;
  const { immutable = true, metadata = {} } = options;

  const sha256Hash = sha256Hex(body);
  const bodyBuffer = Buffer.from(body, 'utf8');

  const { bucketName } = getR2Config();
  const client = getR2Client();

  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bodyBuffer,
      ContentType: 'application/xml; charset=utf-8',
      IfNoneMatch: immutable ? '*' : undefined,
      Metadata: {
        'sha256-hash': sha256Hash,
        'tenant-id': tenantId,
        'invoice-id': invoiceId,
        'issue-date': issueDate,
        'document-type': documentType,
        ...metadata,
      },
    }),
  );

  return {
    storagePath: key,
    sha256Hash,
    sizeBytes: bodyBuffer.length,
    etag: result.ETag ?? '',
  };
}

/**
 * Pobiera obiekt z R2 i weryfikuje integralność przez porównanie SHA-256.
 * Hash mismatch oznacza korupcję danych (lub rozjazd w DB vs obiekt w R2) -
 * rzucamy czytelny błąd, consumer powinien zalogować i oznaczyć wiersz
 * `xml_documents` jako do re-sync.
 */
export async function downloadInvoiceXml(
  storagePath: string,
  expectedSha256Hash: string,
): Promise<string> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: storagePath }),
  );

  const content = await streamToString(response.Body);
  const actualHash = sha256Hex(content);

  if (actualHash !== expectedSha256Hash) {
    throw new Error(
      `R2: hash mismatch for "${storagePath}". ` +
        `Expected ${expectedSha256Hash}, got ${actualHash}. ` +
        `Oznacza to korupcję danych lub rozjazd xml_documents.sha256_hash.`,
    );
  }

  return content;
}

/**
 * Wariant bez weryfikacji - używaj tylko gdy ZNASZ hash z zaufanego źródła
 * (np. właśnie wgrałeś) i chcesz oszczędzić drugiej pętli po buforze.
 * W większości przypadków chcesz `downloadInvoiceXml` z weryfikacją.
 */
export async function downloadInvoiceXmlUnchecked(
  storagePath: string,
): Promise<string> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: storagePath }),
  );
  return streamToString(response.Body);
}

export async function invoiceXmlExists(storagePath: string): Promise<boolean> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: storagePath }),
    );
    return true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (error instanceof NoSuchKey || name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Zwraca pre-signed URL do pobrania XML lub UPO - URL ważny `expiresInSeconds`
 * sekund (domyślnie 300). Przekazuj do frontendu jako link do pobrania,
 * dzięki czemu bandwidth idzie bezpośrednio z R2 (nie przez nasz backend).
 */
export async function getSignedInvoiceUrl(
  storagePath: string,
  expiresInSeconds: number = 300,
): Promise<string> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName, Key: storagePath }),
    { expiresIn: expiresInSeconds },
  );
}

export interface ListedDocument {
  storagePath: string;
  lastModified?: Date;
  sizeBytes?: number;
  /** 'invoice' | 'upo' - wywnioskowane z sufiksu .upo.xml vs .xml */
  documentType: 'invoice' | 'upo';
}

/**
 * Paginowana lista XML-i + UPO w danym folderze miesięcznym.
 * Max 1000 obiektów per strona (hard limit R2). Kontynuacja przez
 * `continuationToken` z poprzedniej odpowiedzi.
 */
export async function listInvoiceDocuments(params: {
  tenantId: string;
  year: number;
  month?: number;
  continuationToken?: string;
  pageSize?: number;
}): Promise<{ documents: ListedDocument[]; continuationToken?: string }> {
  const { tenantId, year, month, continuationToken, pageSize = 100 } = params;
  const { bucketName } = getR2Config();
  const client = getR2Client();

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

  const documents: ListedDocument[] = [];
  for (const obj of result.Contents ?? []) {
    if (!obj.Key) continue;
    documents.push({
      storagePath: obj.Key,
      lastModified: obj.LastModified,
      sizeBytes: obj.Size,
      documentType: obj.Key.endsWith('.upo.xml') ? 'upo' : 'invoice',
    });
  }

  return {
    documents,
    continuationToken: result.IsTruncated ? result.NextContinuationToken : undefined,
  };
}

/**
 * Usuwa obiekt. Używać WYŁĄCZNIE w testach lub do GDPR erasure (i tylko gdy
 * dane nie podlegają obowiązkowi retencji VAT - w prod bucketach z Object Lock
 * operacja zostanie odrzucona przez R2).
 */
export async function deleteInvoiceXml(storagePath: string): Promise<void> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: storagePath }),
  );
}
