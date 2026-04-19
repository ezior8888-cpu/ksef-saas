import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 jest S3-kompatybilne ale ma kilka "gotchas":
 *
 * 1. Region MUSI być 'auto' - R2 replikuje globalnie, nie używa regionów AWS.
 * 2. Endpoint to 'https://<account-id>.r2.cloudflarestorage.com' (bez bucketa w URL).
 * 3. SigV4 podpisywanie działa tak samo jak S3, ale R2 WYMAGA
 *    forcePathStyle=false (virtual-hosted–style) dla wszystkich operacji PUT/GET
 *    obiektów. W list/head buckets akceptowane są oba.
 * 4. R2 NIE wspiera wszystkich API S3 - brakuje: Object Lock Legal Hold,
 *    Bucket Replication, Intelligent-Tiering. ListObjectsV2, GetObject,
 *    PutObject, DeleteObject, HeadObject, CopyObject i presigned URLs działają.
 */

export type R2Jurisdiction = 'default' | 'eu' | 'fedramp';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /**
   * Pełny endpoint S3. Jeśli ustawiony w env - ma priorytet nad auto-gen.
   * Format: https://<account>.r2.cloudflarestorage.com (default)
   *     lub https://<account>.eu.r2.cloudflarestorage.com (EU jurisdiction)
   */
  endpoint: string;
}

function buildEndpoint(accountId: string, jurisdiction: R2Jurisdiction): string {
  const subdomain =
    jurisdiction === 'eu'
      ? '.eu.'
      : jurisdiction === 'fedramp'
        ? '.fedramp.'
        : '.';
  return `https://${accountId}${subdomain}r2.cloudflarestorage.com`;
}

/**
 * Odczytuje konfigurację R2 z env. Rzuca opisowy błąd, jeśli któregoś pola brak.
 *
 * Świadomie NIE eksportujemy domyślnego cache'owanego klienta - chcemy,
 * żeby każdy consumer albo wywołał getR2Config() + getR2Client() z własnym
 * error handlingiem, albo zaimportował high-level API z invoice-archive.ts.
 */
export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const explicitEndpoint = process.env.R2_ENDPOINT;
  const jurisdiction = (process.env.R2_JURISDICTION ?? 'default') as R2Jurisdiction;

  const missing: string[] = [];
  if (!accountId || accountId.startsWith('x')) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId || accessKeyId.startsWith('x')) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey || secretAccessKey.startsWith('x'))
    missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucketName || bucketName.startsWith('x')) missing.push('R2_BUCKET_NAME');

  if (missing.length > 0) {
    throw new Error(
      `R2 env config incomplete - brakuje / placeholder w: ${missing.join(', ')}. ` +
        `Uzupełnij w .env.local zgodnie z sekcją "CLOUDFLARE R2".`,
    );
  }

  // Explicit endpoint wygrywa (np. gdy robimy custom domain / workers binding).
  // W przeciwnym razie składamy z account ID + jurisdiction.
  const endpoint =
    explicitEndpoint && !explicitEndpoint.includes('xxxx')
      ? explicitEndpoint
      : buildEndpoint(accountId!, jurisdiction);

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucketName: bucketName!,
    endpoint,
  };
}

let cachedClient: S3Client | null = null;
let cachedClientConfigHash: string | null = null;

/**
 * Zwraca singleton S3Client skonfigurowany pod R2.
 * Cache unieważnia się, gdy env się zmieni (przydatne w testach).
 */
export function getR2Client(config: R2Config = getR2Config()): S3Client {
  const hash = `${config.accountId}:${config.accessKeyId}`;
  if (cachedClient && cachedClientConfigHash === hash) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 wspiera checksum SHA256 ale nie CRC32/CRC32C, które AWS SDK v3
    // od 3.729+ próbuje wysłać domyślnie. Wyłączamy, żeby uniknąć 400 NotImplemented.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  cachedClientConfigHash = hash;
  return cachedClient;
}
