import type { Invoice } from '@/types/invoice';
import type { CorrectionInvoiceData, AdvanceInvoiceData, FinalInvoiceData } from '@/types/invoice-types';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import {
  generateAdvanceInvoiceXml,
  generateFinalInvoiceXml,
} from '@/lib/ksef/fa3-advance-generator';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { invoiceXmlExistsForId, uploadInvoiceXml } from '@/lib/storage/r2';

import {
  requireKsefVerificationForBackgroundJob,
} from '@/lib/auth/ksef-verification-guard';

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
  /** ISO 8601 timestamp akceptacji; `undefined` jeśli KSeF nie zwrócił go w statusie. */
  acquisitionTimestamp?: string;
}

export async function submitInvoiceFullFlow(
  tenantId: string,
  invoiceId: string,
  invoice: Invoice,
  auth: KsefAuth,
  env?: 'test' | 'demo' | 'production',
  correctionData?: CorrectionInvoiceData | null,
  advanceData?: AdvanceInvoiceData | null,
  /** Dla ROZ — XML potrzebuje osobnego bloku rozliczenia z listą zaliczek. */
  finalPayload?:
    | { finalData: FinalInvoiceData; advanceSettlementRows: AdvanceInvoiceSettlementRow[] }
    | null,
): Promise<FullSubmitResult> {
  await requireKsefVerificationForBackgroundJob(tenantId);

  // 1. Generuj XML (faktura VAT albo faktura korygująca FA(3)).
  const xml =
    correctionData != null
      ? generateCorrectionInvoiceXml(correctionData)
      : advanceData != null
        ? generateAdvanceInvoiceXml(advanceData)
      : finalPayload != null && finalPayload.advanceSettlementRows.length > 0
        ? generateFinalInvoiceXml(finalPayload.finalData, finalPayload.advanceSettlementRows)
        : generateFA3Xml(invoice);

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
  //
  //    Idempotency dwuwarstwowa, oparta o deterministyczny generator FA(3):
  //      a) HEAD przed PUT — przy retry wykrywamy istnienie obiektu i wyłączamy
  //         `IfNoneMatch: '*'`, żeby drugi PUT nie wracał `PreconditionFailed`
  //         w środku flow (a wtedy `submit-to-ksef` retryowałby w nieskończoność).
  //      b) `IfNoneMatch: '*'` na pierwszym wgraniu — gwarantuje, że dwa
  //         równoczesne calle z różnych instancji nie nadpiszą się nawzajem.
  //      c) Obsługa `PreconditionFailed` w `r2.uploadXmlDocument` — gdyby a) i b)
  //         zawiodły jednocześnie (np. klient_już-uploadował, my retryujemy
  //         z `immutable=true`), traktujemy to jako sukces idempotentny.
  const alreadyUploaded = await invoiceXmlExistsForId(
    tenantId,
    invoiceId,
    invoice.issueDate,
  );

  const uploadResult = await uploadInvoiceXml(
    tenantId,
    invoiceId,
    invoice.issueDate,
    xml,
    { immutable: !alreadyUploaded },
  );

  // 4. Wysyłka do KSeF (rate-limited, z enkrypcją i auto-close sesji).
  //    `auditContext` propaguje się do każdego `ksefFetch` w środku — dzięki
  //    temu każdy request do MF wpisuje się do `audit_logs` (Faza 23 sekcja 3).
  const submitResult = await submitInvoice(xml, auth, env, {
    tenantId,
    invoiceId,
  });

  return {
    ksefNumber: submitResult.ksefNumber,
    xmlStoragePath: uploadResult.storagePath,
    xmlSha256Hash: uploadResult.sha256Hash,
    acquisitionTimestamp: submitResult.acquisitionTimestamp,
  };
}
