/**
 * Tymczasowe storage dla wgranych plików (przed parsowaniem).
 */

import { downloadFromR2, uploadToR2 } from '@/lib/storage/r2';

const IMPORT_PREFIX = 'imports';

export function getImportFilePath(
  tenantId: string,
  importJobId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return `${IMPORT_PREFIX}/${tenantId}/${importJobId}/${safe}`;
}

export async function uploadImportFile(
  tenantId: string,
  importJobId: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const path = getImportFilePath(tenantId, importJobId, filename);
  await uploadToR2(path, buffer, contentType);
  return path;
}

export async function downloadImportFile(path: string): Promise<Buffer> {
  return downloadFromR2(path);
}
