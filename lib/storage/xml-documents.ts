/**
 * Wiersz `xml_documents` dla XML-a przyjętego przez KSeF (AUD-12).
 *
 * Tabela ma czterech czytelników — PDF (kod QR KOD I z SHA-256 pliku),
 * „Pobierz XML” (weryfikacja skrótu), portal księgowej i archiwizacja do
 * Glacier — a do 02.10.2026 nikt jej nie zapisywał (00027 zakładał, że robi
 * to warstwa magazynu). Zapis idzie przez klienta admina: `authenticated`
 * nie ma prawa zapisu do tej tabeli (00027).
 *
 * Jeden wiersz na fakturę. Ponowienie musi wskazywać ten sam plik i te same
 * bajty; raz zapisanych dowodów nie zastępujemy danymi kolejnej próby.
 */

import { createHash } from 'node:crypto';

import { requireInvoiceTenant } from '@/lib/jobs/runners/tenant-boundary';
import { createAdminClient } from '@/lib/supabase/admin';

import { downloadFromR2 } from './r2';
import { assertTenantStoragePath } from './tenant-path';

export interface XmlDocumentRecord {
  tenantId: string;
  invoiceId: string;
  storagePath: string;
  /** Oczekiwany skrót; zawsze porównywany z dokładnymi bajtami w magazynie. */
  sha256Hash?: string;
  sizeBytes?: number;
}

export async function recordXmlDocument(record: XmlDocumentRecord): Promise<void> {
  assertTenantStoragePath(record.storagePath, record.tenantId);
  await requireInvoiceTenant(record.invoiceId, record.tenantId);

  // Importy mogą zawierać BOM lub inne kodowanie. Skrót i rozmiar dotyczą
  // oryginalnego bufora, bez dekodowania XML i ponownego kodowania UTF-8.
  const bytes = await downloadFromR2(record.storagePath, record.tenantId);
  const sha256Hash = createHash('sha256').update(bytes).digest('hex');
  const sizeBytes = bytes.length;
  if ((record.sha256Hash !== undefined && record.sha256Hash !== sha256Hash) ||
      (record.sizeBytes !== undefined && record.sizeBytes !== sizeBytes)) {
    throw new Error('xml_documents: zapisany plik nie zgadza się z oczekiwanym XML');
  }

  const admin = createAdminClient();
  const row = {
    storage_provider: 'r2',
    storage_path: record.storagePath,
    sha256_hash: sha256Hash,
    file_size_bytes: sizeBytes,
  };
  const readExisting = async () => {
    const { data, error } = await admin
      .from('xml_documents')
      .select('storage_provider, storage_path, sha256_hash, file_size_bytes')
      .eq('invoice_id', record.invoiceId)
      .eq('tenant_id', record.tenantId)
      .limit(2);
    if (error) throw new Error(`xml_documents: ${error.message}`);
    if (!data) throw new Error('xml_documents: brak wyniku odczytu metadanych');
    if (data.length > 1) throw new Error('xml_documents: wiele zapisów XML dla jednej faktury');
    const existing = data[0];
    if (existing && (existing.storage_provider !== row.storage_provider ||
        existing.storage_path !== row.storage_path || existing.sha256_hash !== row.sha256_hash ||
        existing.file_size_bytes !== row.file_size_bytes)) {
      throw new Error('xml_documents: istniejący zapis wskazuje inny plik XML');
    }
    return existing;
  };

  if (await readExisting()) return;
  const { error } = await admin.from('xml_documents')
    .insert({ ...row, invoice_id: record.invoiceId, tenant_id: record.tenantId });
  if (!error) return;
  if (error.code !== '23505') throw new Error(`xml_documents: ${error.message}`);

  // Unikalność z 00129 rozstrzyga równoległe zapisy. Sam konflikt klucza
  // nie jest sukcesem: zwycięski wiersz musi zawierać dokładnie te same dowody.
  if (!await readExisting()) {
    throw new Error('xml_documents: konflikt zapisu bez metadanych XML');
  }
}
