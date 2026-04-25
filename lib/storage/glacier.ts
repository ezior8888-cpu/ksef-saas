import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let cachedClient: S3Client | null = null;

function getGlacierClient(): S3Client {
  if (cachedClient) return cachedClient;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION ?? 'eu-central-1';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials missing');
  }

  cachedClient = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function getArchiveBucket(): string {
  const bucket =
    process.env.AWS_ARCHIVE_BUCKET ?? process.env.AWS_GLACIER_BUCKET;
  if (!bucket) {
    throw new Error(
      'AWS_ARCHIVE_BUCKET or AWS_GLACIER_BUCKET must be set for Glacier uploads'
    );
  }
  return bucket;
}

/**
 * Uploaduje XML do S3 Glacier Deep Archive.
 * Zwraca klucz obiektu (path) zapisany potem w `invoices.archive_storage_path`.
 */
export async function uploadToGlacier(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
  xmlContent: string
): Promise<string> {
  const dateStr = issueDate.slice(0, 10);
  const [year, month] = dateStr.split('-');
  if (!year || !month) {
    throw new Error(`Invalid issue_date for Glacier key: ${issueDate}`);
  }
  const key = `${tenantId}/${year}/${month}/${invoiceId}.xml`;

  await getGlacierClient().send(
    new PutObjectCommand({
      Bucket: getArchiveBucket(),
      Key: key,
      Body: Buffer.from(xmlContent, 'utf8'),
      ContentType: 'application/xml',
      StorageClass: 'DEEP_ARCHIVE',
    })
  );

  return key;
}
