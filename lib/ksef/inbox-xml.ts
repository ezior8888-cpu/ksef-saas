/**
 * Oryginał XML faktury otrzymanej ze skrzynki KSeF (#122 część B, C-12).
 *
 * Odbiór skrzynki zapisuje tylko metadane. Bez pliku PDF faktury otrzymanej
 * nie ma KODU I, a „Pobierz XML” i portal księgowej nie mają czego wydać.
 * Pobieramy dokładne bajty z KSeF, zapisujemy w folderze firmy i dopinamy
 * `xml_documents` oraz `xml_storage_path`.
 *
 * Błąd nie blokuje kosztu (kategoryzacja idzie dalej): PDF zostaje wtedy
 * podglądem z dopiskiem (decyzja B14), a zdarzenie widać w Sentry.
 */

import * as Sentry from '@sentry/nextjs';

import { archiveImportedKsefXml } from '@/lib/import/ksef-xml-archive';
import { fetchInvoiceXmlBytes } from '@/lib/ksef/history-fetcher';
import { recordXmlDocument } from '@/lib/storage/xml-documents';
import { createAdminClient } from '@/lib/supabase/admin';
import type { KsefEnvironment } from '@/types/ksef';

export type InboxXmlResult =
  | { archived: true }
  | { archived: false; reason: 'invoice' | 'not-applicable' | 'has-xml' | 'error' };

export async function archiveInboxInvoiceXml(params: {
  tenantId: string;
  invoiceId: string;
  environment: KsefEnvironment;
}): Promise<InboxXmlResult> {
  const { tenantId, invoiceId, environment } = params;
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('invoices')
    .select('id, tenant_id, direction, ksef_number, ksef_environment, xml_storage_path')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !row || row.tenant_id !== tenantId) return { archived: false, reason: 'invoice' };

  const ksefNumber = row.ksef_number?.trim();
  if (row.direction !== 'incoming' || row.ksef_environment !== environment || !ksefNumber) {
    return { archived: false, reason: 'not-applicable' };
  }
  if (row.xml_storage_path) return { archived: false, reason: 'has-xml' };

  try {
    const bytes = await fetchInvoiceXmlBytes(tenantId, ksefNumber, environment);
    const archive = await archiveImportedKsefXml(tenantId, ksefNumber, bytes);
    // Najpierw wiersz ze skrótem, potem ścieżka przy fakturze: awaria
    // w połowie nie może zostawić ścieżki bez skrótu (ten krok by ją pominął).
    await recordXmlDocument({ tenantId, invoiceId, ...archive });
    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({ xml_storage_path: archive.storagePath })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .is('xml_storage_path', null)
      .select('id')
      .maybeSingle();
    if (updateError || updated?.id !== invoiceId) {
      throw new Error(updateError?.message ?? 'Faktura zmieniła się podczas zapisu XML');
    }
    return { archived: true };
  } catch (e) {
    Sentry.captureException(e, {
      tags: { area: 'ksef.inbox-xml' },
      extra: { invoiceId },
    });
    return { archived: false, reason: 'error' };
  }
}
