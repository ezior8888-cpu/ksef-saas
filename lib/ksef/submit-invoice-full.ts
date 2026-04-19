import type { Invoice } from '@/types/invoice';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { uploadInvoiceXml } from '@/lib/storage/r2';

import type { KsefAuth } from './auth';
import { submitInvoice } from './submit';

/**
 * FULL FLOW: od modelu domenowego faktury do numeru KSeF.
 *
 *   1. Generuj XML FA(3) (+ walidacja biznesowa: NIP/IBAN/arytmetyka)
 *   2. Waliduj XSD lokalnie (xmllint-wasm, offline)
 *   3. Upload XML do R2 PRZED wysyłką do KSeF
 *      - sukces KSeF → mamy archive
 *      - odrzucenie KSeF → mamy historię próby (wymogi audytowe, 10 lat)
 *   4. Wyślij do KSeF (enkrypcja + sesja online + polling statusu)
 *   5. Zwróć numer KSeF + metadane do zapisania w DB
 *
 * UPO NIE jest tutaj pobierane / uploadowane - zwracamy URL do pobrania,
 * consumer (Inngest job) decyduje kiedy fetch + uploadInvoiceUpo.
 */
export interface FullSubmitResult {
  ksefNumber: string;
  xmlStoragePath: string;
  xmlSha256Hash: string;
  acquisitionTimestamp: string;
}

export async function submitInvoiceFullFlow(
  tenantId: string,
  invoiceId: string,
  invoice: Invoice,
  auth: KsefAuth,
  env?: 'test' | 'demo' | 'production',
): Promise<FullSubmitResult> {
  // 1. Generuj XML (z walidacją biznesową wewnątrz generatora).
  const xml = generateFA3Xml(invoice);

  // 2. Waliduj XSD - jeśli XML się nie zgadza ze schematem FA(3), KSeF i tak
  //    by go odrzucił. Robimy to lokalnie żeby nie palić sesji KSeF
  //    (limit otwartych sesji per podmiot + czas dostępu do API).
  const validation = await validateInvoiceXml(xml);
  if (!validation.valid) {
    throw new Error(
      `XML FA(3) jest niezgodny ze schematem XSD:\n${validation.errors
        .map((e) => `  Linia ${e.line}: ${e.message}`)
        .join('\n')}`,
    );
  }

  // 3. Upload do R2 PRZED wysyłką do KSeF.
  //    - sukces KSeF → mamy archive z SHA-256 integrity check
  //    - odrzucenie KSeF → też mamy historię próby (audit / retry)
  //    IfNoneMatch='*' zablokuje nadpisanie, więc drugi call submitInvoiceFullFlow
  //    na tej samej (tenantId, invoiceId) parze rzuci PreconditionFailed - pożądane,
  //    bo deduplikuje wysyłki (idempotency na poziomie storage).
  const uploadResult = await uploadInvoiceXml(
    tenantId,
    invoiceId,
    invoice.issueDate,
    xml,
  );

  // 4. Wysyłka do KSeF (rate-limited, z enkrypcją i auto-close sesji).
  const submitResult = await submitInvoice(xml, auth, env);

  return {
    ksefNumber: submitResult.ksefNumber,
    xmlStoragePath: uploadResult.storagePath,
    xmlSha256Hash: uploadResult.sha256Hash,
    acquisitionTimestamp: submitResult.acquisitionTimestamp,
  };
}
