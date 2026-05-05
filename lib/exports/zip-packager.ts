// lib/exports/zip-packager.ts
// Pakowanie wielu plików do jednego ZIP

import archiver from 'archiver';
import { PassThrough } from 'stream';

export interface PackagedFile {
  filename: string;
  content: Buffer;
}

export async function packageZip(files: PackagedFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on(
      'data',
      /** Node może przekazać string przy encoding — domyślnie dostajemy Buffer. */
      (chunk: string | Buffer) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
      },
    );
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));

    archive.once('error', reject);

    archive.pipe(stream);

    for (const file of files) {
      archive.append(file.content, { name: file.filename });
    }

    void archive.finalize().catch(reject);
  });
}

// ============================================================================
// Nazwa paczki dla danego okresu
// ============================================================================

export function createPackageName(
  tenantNip: string,
  periodStart: string,
  periodEnd: string,
): string {
  const safeNip = tenantNip.replace(/[^0-9]/g, '');
  return `KSiegowosc_${safeNip}_${periodStart}_${periodEnd}.zip`;
}
