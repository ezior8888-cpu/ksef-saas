/**
 * Pliki robocze skryptów deweloperskich (ID seedowanej firmy, faktury, wyniki).
 *
 * Katalog `.tmp/` w repo zamiast `/tmp`: wspólny katalog tymczasowy systemu
 * jest do odczytu i podmiany dla innych użytkowników maszyny (CodeQL
 * js/insecure-temporary-file), a na Windows `/tmp` w ogóle nie istnieje.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function scratchFile(name: string): string {
  const dir = join(process.cwd(), '.tmp');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, name);
}
