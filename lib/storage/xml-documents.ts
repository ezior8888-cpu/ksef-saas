/**
 * Wiersz `xml_documents` dla XML-a przyjętego przez KSeF (AUD-12).
 *
 * Tabela ma czterech czytelników — PDF (kod QR KOD I z SHA-256 pliku),
 * „Pobierz XML” (weryfikacja skrótu), portal księgowej i archiwizacja do
 * Glacier — a do 02.10.2026 nikt jej nie zapisywał (00027 zakładał, że robi
 * to warstwa magazynu). Zapis idzie przez klienta admina: `authenticated`
 * nie ma prawa zapisu do tej tabeli (00027).
 *
 * Idempotentnie: jeden wiersz na fakturę; ponowienie aktualizuje ścieżkę
 * i skrót zamiast dopisywać kolejny.
 */

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

import { downloadInvoiceXmlUnchecked } from './r2';

export interface XmlDocumentRecord {
  tenantId: string;
  invoiceId: string;
  storagePath: string;
  /** Brak = policz z pliku w magazynie (uzgodnienie bez świeżego uploadu). */
  sha256Hash?: string;
  sizeBytes?: number;
}

export async function recordXmlDocument(record: XmlDocumentRecord): Promise<void> {
  let { sha256Hash, sizeBytes } = record;
  if (!sha256Hash) {
    const xml = await downloadInvoiceXmlUnchecked(record.storagePath, record.tenantId);
    sha256Hash = createHash('sha256').update(xml, 'utf8').digest('hex');
    sizeBytes = Buffer.byteLength(xml, 'utf8');
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from('xml_documents')
    .select('id')
    .eq('invoice_id', record.invoiceId)
    .eq('tenant_id', record.tenantId)
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(`xml_documents: ${readError.message}`);

  const row = {
    storage_provider: 'r2',
    storage_path: record.storagePath,
    sha256_hash: sha256Hash,
    file_size_bytes: sizeBytes ?? null,
  };
  const { error } = existing
    ? await admin.from('xml_documents').update(row).eq('id', existing.id)
    : await admin
        .from('xml_documents')
        .insert({ ...row, invoice_id: record.invoiceId, tenant_id: record.tenantId });
  if (error) throw new Error(`xml_documents: ${error.message}`);
}
