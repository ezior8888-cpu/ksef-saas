/**
 * Smoke test: Cloudflare R2 archiwizacja faktur.
 *
 * Wykonuje pełny cykl: upload → head → list → get → signed URL → delete.
 * Wszystko w przestrzeni tenantId='__smoke__' + wygenerowane timestampem nazwy,
 * więc można odpalać wielokrotnie bez kolizji.
 *
 * Wymaga w .env.local wypełnionych:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Uruchom:
 *   pnpm r2:smoke
 */

import { config } from 'dotenv';
import { getR2Client, getR2Config } from '../lib/storage/r2-client';
import {
  archiveInvoice,
  deleteInvoice,
  getInvoiceXml,
  getSignedInvoiceUrl,
  getUpoXml,
  invoiceExists,
  listInvoices,
  type ArchiveKey,
} from '../lib/storage/invoice-archive';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function ok(msg: string) {
  console.log(`${GREEN}✔${RESET} ${msg}`);
}
function fail(msg: string): never {
  console.error(`${RED}✘${RESET} ${msg}`);
  process.exit(1);
}
function info(msg: string) {
  console.log(`${DIM}${msg}${RESET}`);
}

async function main() {
  const cfg = getR2Config();
  info(`bucket:    ${cfg.bucketName}`);
  info(`endpoint:  ${cfg.endpoint}`);
  info(`accessKey: ${cfg.accessKeyId.slice(0, 8)}...${cfg.accessKeyId.slice(-4)}\n`);

  const client = getR2Client();

  // Preflight: używamy ListObjectsV2 zamiast HeadBucket, bo tokens scoped
  // "Object Read & Write" nie mają uprawnień do account-level HeadBucket.
  try {
    await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucketName, MaxKeys: 1 }),
    );
    ok(`bucket "${cfg.bucketName}" dostępny dla tokena (ListObjectsV2 OK)`);
  } catch (err) {
    const e = err as {
      name?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
      $response?: { statusCode?: number; body?: unknown };
    };
    const status = e.$metadata?.httpStatusCode ?? e.$response?.statusCode;
    console.error(`${RED}preflight failed:${RESET}`);
    console.error(`  name:   ${e.name}`);
    console.error(`  status: ${status}`);
    console.error(`  msg:    ${e.message}`);
    if (e.$response?.body) {
      try {
        const body =
          typeof (e.$response.body as { transformToString?: () => Promise<string> })
            .transformToString === 'function'
            ? await (
                e.$response.body as { transformToString: () => Promise<string> }
              ).transformToString()
            : String(e.$response.body);
        console.error(`  body:   ${body.slice(0, 500)}`);
      } catch {}
    }
    fail(`nie mogę połączyć się z bucketem`);
  }

  const key: ArchiveKey = {
    tenantId: '__smoke__',
    ksefNumber: `2026040119000000-TEST-${Date.now()}`,
    issueDate: new Date(),
  };

  const invoiceXml = '<?xml version="1.0" encoding="UTF-8"?><Faktura><TEST>1</TEST></Faktura>';
  const upoXml = '<?xml version="1.0" encoding="UTF-8"?><UPO><TEST>1</TEST></UPO>';

  try {
    const archived = await archiveInvoice({
      key,
      invoiceXml,
      upoXml,
      metadata: { 'smoke-test': '1', 'generated-at': new Date().toISOString() },
    });
    ok(
      `archiveInvoice: ETag invoice=${archived.etag.invoice}, ` +
        `${archived.sizeBytes.invoice}B / UPO ${archived.sizeBytes.upo}B`,
    );

    const exists = await invoiceExists(key);
    if (!exists) fail('invoiceExists zwróciło false tuż po uploadzie');
    ok('invoiceExists: true');

    const [fetchedInvoice, fetchedUpo] = await Promise.all([
      getInvoiceXml(key),
      getUpoXml(key),
    ]);
    if (fetchedInvoice !== invoiceXml) fail('fetched invoice != uploaded invoice');
    if (fetchedUpo !== upoXml) fail('fetched upo != uploaded upo');
    ok('getInvoiceXml + getUpoXml: zawartość bit-exact');

    const signedUrl = await getSignedInvoiceUrl(key, { expiresInSeconds: 60 });
    if (!signedUrl.startsWith('https://')) fail(`signed URL nie wygląda OK: ${signedUrl}`);
    ok(`getSignedInvoiceUrl: ${signedUrl.slice(0, 80)}...`);

    const { invoices } = await listInvoices({
      tenantId: key.tenantId,
      year: (key.issueDate ?? new Date()).getUTCFullYear(),
      month: (key.issueDate ?? new Date()).getUTCMonth() + 1,
      pageSize: 50,
    });
    const found = invoices.find((inv) => inv.ksefNumber === key.ksefNumber);
    if (!found) fail(`listInvoices: nie znaleziono wgranego ${key.ksefNumber}`);
    ok(`listInvoices: znaleziono (łącznie ${invoices.length} w tym folderze)`);

    try {
      await archiveInvoice({ key, invoiceXml, upoXml });
      fail('drugi archiveInvoice na tym samym kluczu powinien rzucić PreconditionFailed');
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== 'PreconditionFailed') {
        fail(`oczekiwałem PreconditionFailed, dostałem: ${name ?? err}`);
      }
      ok('ponowny PUT zablokowany przez IfNoneMatch=* (immutability)');
    }
  } finally {
    try {
      await deleteInvoice(key);
      ok(`cleanup: deleteInvoice ${key.ksefNumber}`);
    } catch (err) {
      console.warn(
        `${RED}cleanup failed (możesz ręcznie usunąć ${key.tenantId}/...):${RESET}`,
        err,
      );
    }
  }

  console.log(`\n${GREEN}R2 smoke test PASS${RESET}`);
}

main().catch((err) => {
  console.error(`\n${RED}R2 smoke test FAIL${RESET}`);
  console.error(err);
  process.exit(1);
});
