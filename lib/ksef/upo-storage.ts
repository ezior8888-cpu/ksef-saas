/** Zapis i odczyt UPO z Cloudflare R2 (klucze pod `upo/…`). */

import { uploadToR2, downloadFromR2 } from '@/lib/storage/r2';

const UPO_PREFIX = 'upo';

export function getUpoXmlPath(tenantId: string, invoiceId: string): string {
  return `${UPO_PREFIX}/${tenantId}/${invoiceId}.xml`;
}

export function getUpoPdfPath(tenantId: string, invoiceId: string): string {
  return `${UPO_PREFIX}/${tenantId}/${invoiceId}.pdf`;
}

export async function uploadUpoXml(
  tenantId: string,
  invoiceId: string,
  upoXml: string,
): Promise<string> {
  const path = getUpoXmlPath(tenantId, invoiceId);
  await uploadToR2(path, Buffer.from(upoXml, 'utf-8'), 'application/xml');
  return path;
}

export async function uploadUpoPdf(
  tenantId: string,
  invoiceId: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const path = getUpoPdfPath(tenantId, invoiceId);
  await uploadToR2(path, pdfBuffer, 'application/pdf');
  return path;
}

export async function downloadUpoXml(
  tenantId: string,
  invoiceId: string,
): Promise<string> {
  const path = getUpoXmlPath(tenantId, invoiceId);
  const buffer = await downloadFromR2(path);
  return buffer.toString('utf-8');
}

export async function downloadUpoPdf(
  tenantId: string,
  invoiceId: string,
): Promise<Buffer> {
  const path = getUpoPdfPath(tenantId, invoiceId);
  return downloadFromR2(path);
}
