/**
 * Oryginał XML faktury z importu historii KSeF (#122 część B, R6, C-12).
 *
 * KOD I na wizualizacji faktury to link z SHA-256 pliku XML dokładnie takiego,
 * jaki jest w KSeF. Do 02.10.2026 import parsował XML i go wyrzucał, więc PDF
 * takiej faktury nie mógł mieć kodu. Tu zapisujemy bajty z KSeF w folderze
 * firmy i liczymy skrót z nich — nie z tekstu po dekodowaniu (BOM).
 */

import { createHash } from 'node:crypto';

import { downloadFromR2, uploadToR2IfAbsent } from '@/lib/storage/r2';

export interface ArchivedKsefXml {
  /** Klucz w magazynie — `xml_storage_path` faktury i `xml_documents.storage_path`. */
  storagePath: string;
  /** SHA-256 (hex) dokładnych bajtów XML z KSeF. */
  sha256Hash: string;
  sizeBytes: number;
}

const UTF8_BOM = '﻿';

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Klucz deterministyczny po numerze KSeF — ponowienie importu trafia w ten sam obiekt. */
export function importedKsefXmlKey(tenantId: string, ksefNumber: string): string {
  const number = ksefNumber.trim();
  if (!/^[A-Za-z0-9-]{1,64}$/.test(number)) {
    throw new Error('Niepoprawny numer KSeF dla archiwum XML');
  }
  return `${tenantId}/ksef-import/${number}.xml`;
}

/** Tekst do parsera FA(3) — bez BOM, który nie jest częścią dokumentu XML. */
export function decodeKsefXml(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

/** W archiwum jest już INNY plik pod tym numerem KSeF — wymaga wyjaśnienia, nie ponowienia. */
export class KsefXmlArchiveConflictError extends Error {
  constructor(readonly ksefNumber: string) {
    super(`Archiwum XML ${ksefNumber}: w magazynie jest inny plik — wymagane uzgodnienie`);
    this.name = 'KsefXmlArchiveConflictError';
  }
}

/**
 * Zapisuje XML (tylko gdy obiektu jeszcze nie ma) i zwraca ścieżkę ze skrótem.
 * Istniejący obiekt z innym skrótem przerywa import — dwa różne pliki pod
 * jednym numerem KSeF wymagają ręcznego wyjaśnienia, nie nadpisania.
 */
export async function archiveImportedKsefXml(
  tenantId: string,
  ksefNumber: string,
  bytes: Buffer,
): Promise<ArchivedKsefXml> {
  const storagePath = importedKsefXmlKey(tenantId, ksefNumber);
  const sha256Hash = sha256Hex(bytes);
  const uploaded = await uploadToR2IfAbsent(storagePath, bytes, 'application/xml');
  if (!uploaded) {
    const existing = await downloadFromR2(storagePath, tenantId);
    if (sha256Hex(existing) !== sha256Hash) {
      throw new KsefXmlArchiveConflictError(ksefNumber);
    }
  }
  return { storagePath, sha256Hash, sizeBytes: bytes.length };
}
