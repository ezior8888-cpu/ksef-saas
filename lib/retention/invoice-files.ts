import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { deleteFromGlacier } from '@/lib/storage/glacier';
import { listInvoiceAttemptXmls } from '@/lib/storage/r2';
import { getR2Client, getR2Config } from '@/lib/storage/r2-client';
import { isTenantStoragePath } from '@/lib/storage/tenant-path';
import type { createAdminClient } from '@/lib/supabase/server';

/**
 * Pliki faktury w magazynach — do usunięcia razem z fakturą po retencji
 * (AUD-45). Do 02.10 zadanie kasowało tylko wiersze: XML, UPO, PDF,
 * załączniki ponagleń w R2 i kopie w Glacier zostawały bez śladu w bazie.
 *
 * Źródła kluczy: kolumny faktury, `xml_documents` (XML i UPO, R2 albo
 * Glacier), `upo_receipts`, `payment_reminders` (PDF wezwania).
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RetainedInvoice {
  id: string;
  tenant_id: string;
  xml_storage_path?: string | null;
  pdf_storage_path?: string | null;
  archive_storage_path?: string | null;
  /** Data wystawienia — folder prób wysyłki `tenant/yyyy/mm/invoiceId/` (D5). */
  issue_date?: string | null;
}

export interface InvoiceStorageKeys {
  r2: string[];
  glacier: string[];
  /** Klucze spoza katalogu firmy — nie usuwamy (dane wierszy są zapisywalne). */
  foreign: number;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function collectInvoiceStorageKeys(
  client: AdminClient,
  invoice: RetainedInvoice,
): Promise<InvoiceStorageKeys> {
  const r2 = new Set<string>();
  const glacier = new Set<string>();

  const add = (target: Set<string>, value: unknown) => {
    const key = text(value);
    if (key) target.add(key);
  };
  add(r2, invoice.xml_storage_path);
  add(r2, invoice.pdf_storage_path);
  add(glacier, invoice.archive_storage_path);

  const read = async (table: string, columns: string) => {
    const { data, error } = await client
      .from(table as 'xml_documents')
      .select(columns)
      .eq('invoice_id', invoice.id)
      .eq('tenant_id', invoice.tenant_id);
    // „Nie wiem, jakie pliki ma faktura” to nie „nie ma plików” — inaczej
    // wiersz zniknie, a pliki zostaną na zawsze.
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  };

  for (const row of await read('xml_documents', 'storage_provider, storage_path')) {
    add(row.storage_provider === 's3_glacier' ? glacier : r2, row.storage_path);
  }
  for (const row of await read('upo_receipts', 'upo_xml_path, upo_pdf_path, archive_glacier_key')) {
    add(r2, row.upo_xml_path);
    add(r2, row.upo_pdf_path);
    add(glacier, row.archive_glacier_key);
  }
  for (const row of await read('payment_reminders', 'pdf_attachment_path')) {
    add(r2, row.pdf_attachment_path);
  }
  // D5: pliki wszystkich prób wysyłki (także nieudanych) leżą w folderze
  // faktury; wiersz wskazuje tylko plik przyjęty. Błąd listowania = wyjątek.
  const issueDate = text(invoice.issue_date);
  if (issueDate && /^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    for (const key of await listInvoiceAttemptXmls(invoice.tenant_id, invoice.id, issueDate)) add(r2, key);
  }

  const own = (key: string) => isTenantStoragePath(key, invoice.tenant_id);
  const all = [...r2, ...glacier];
  return {
    r2: [...r2].filter(own),
    glacier: [...glacier].filter(own),
    foreign: all.filter((key) => !own(key)).length,
  };
}

/** Usuwa pliki; brak obiektu to nie błąd. Zwraca liczbę usuniętych kluczy. */
export async function deleteInvoiceStorage(keys: InvoiceStorageKeys): Promise<number> {
  if (keys.r2.length > 0) {
    const { bucketName } = getR2Config();
    const client = getR2Client();
    for (const key of keys.r2) {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    }
  }
  for (const key of keys.glacier) {
    await deleteFromGlacier(key);
  }
  return keys.r2.length + keys.glacier.length;
}
