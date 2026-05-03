import { Inngest, eventType, staticSchema } from 'inngest';
import type { Invoice } from '@/types/invoice';
import type { CorrectionInvoiceData, AdvanceInvoiceData, FinalInvoiceData } from '@/types/invoice-types';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';

/**
 * Inngest v4 nie ma już `EventSchemas().fromRecord<Record>()` z v3 -
 * zamiast tego każdy event jest zadeklarowany jako `EventType` przez
 * `eventType('nazwa', { schema: staticSchema<Shape>() })`.
 *
 * Zalety vs stary `type Events = {...}`:
 *   - ten sam obiekt służy za (a) trigger dla `createFunction`,
 *     (b) builder payloadu (`event.create({...})`), (c) źródło typów,
 *   - można go zaimportować punktowo do handlera bez importowania całego klienta.
 *
 * `staticSchema<T>()` to type-only schema: bez runtime walidacji (Zod/valibot
 * dodamy dopiero jeśli potrzebujemy). Business-walidacja dzieje się w
 * formularzu (RHF + Zod) i w `generateFA3Xml`, więc Inngest jest tylko kanałem
 * transportu.
 */

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════

/** Użytkownik kliknął "Wyślij fakturę do KSeF" w UI. */
export const invoiceSubmitRequested = eventType('invoice/submit.requested', {
  schema: staticSchema<{
    tenantId: string;
    invoiceId: string;
    invoice: Invoice;
    /** NIP tenanta (klucz rate-limitera + kontekst sesji KSeF). */
    nip: string;
    /** Gdy ustawione, generujemy XML z `generateCorrectionInvoiceXml`. */
    correctionData?: CorrectionInvoiceData;
    /** Faktura ZAL w FA(3). */
    advanceData?: AdvanceInvoiceData;
    /** ROZ — nagłówek bez listy zaliczek; użyj razem z `finalAdvanceSettlementRows`. */
    finalData?: FinalInvoiceData;
    finalAdvanceSettlementRows?: AdvanceInvoiceSettlementRow[];
    fromOfflineQueue?: boolean;
    offlineQueueId?: string;
    idempotencyKey?: string;
  }>(),
});

/** Faktura została zaakceptowana przez KSeF i zarchiwizowana w R2. */
export const invoiceSubmitSucceeded = eventType('invoice/submit.succeeded', {
  schema: staticSchema<{
    tenantId: string;
    invoiceId: string;
    ksefNumber: string;
    /** Opcjonalne — konsumenci mogą pobierać ścieżkę z rekordu faktury w DB. */
    xmlStoragePath?: string;
    fromOfflineQueue?: boolean;
  }>(),
});

/** Wysyłka do KSeF nieudana (XSD fail, API error, rate-limit wyczerpany). */
export const invoiceSubmitFailed = eventType('invoice/submit.failed', {
  schema: staticSchema<{
    tenantId: string;
    invoiceId: string;
    error: string;
    fromOfflineQueue?: boolean;
  }>(),
});

/**
 * Fan-out z `inbox-polling-cron` do per-tenant handlera.
 * Cron nie robi sam polling'u dla wszystkich tenantów w jednym uruchomieniu
 * (pojedynczy job przetwarzający 1000 tenantów trwałby >60min i łatwo by się
 * wywalał). Zamiast tego wybiera aktywnych tenantów i dla każdego emituje ten
 * event - Inngest dystrybuuje je równolegle z `concurrency.limit`.
 */
export const inboxPollTenant = eventType('inbox/poll.tenant', {
  schema: staticSchema<{
    tenantId: string;
    nip: string;
  }>(),
});

/** Znaleziono nową fakturę w skrzynce KSeF (subject2 = nabywca). */
export const inboxInvoiceReceived = eventType('inbox/invoice.received', {
  schema: staticSchema<{
    tenantId: string;
    ksefNumber: string;
    sellerNip: string;
    sellerName: string;
    grossAmount: number;
    currency: string;
    acquisitionTimestamp: string;
  }>(),
});

/** Zaplanuj pobranie UPO dla faktury po akceptacji w KSeF. */
export const invoiceUpoRequested = eventType('invoice/upo.requested', {
  schema: staticSchema<{
    invoiceId: string;
    tenantId: string;
    ksefNumber: string;
  }>(),
});

/** Żądanie Magicznego Importu historii faktur z KSeF (wydane lub odebrane). */
export const importKsefHistoryRequested = eventType('import/ksef-history.requested', {
  schema: staticSchema<{
    importJobId: string;
    tenantId: string;
    dateFrom: string;
    dateTo: string;
    direction: 'issued' | 'received';
  }>(),
});

/** Wgrany plik JPK_FA / CSV gotowy do parsowania (ścieżka w R2 z `file-storage`). */
export const importFileUploaded = eventType('import/file.uploaded', {
  schema: staticSchema<{
    importJobId: string;
    tenantId: string;
    filePath: string;
    source:
      | 'jpk_fa'
      | 'fakturownia_csv'
      | 'infakt_csv'
      | 'wfirma_csv'
      | 'ifirma_csv';
  }>(),
});

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

export const inngest = new Inngest({
  id: 'ksef-saas',
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
  // INNGEST_DEV=1 → ignoruj klucze, bij w Inngest Dev Server na localhost:8288.
  isDev: process.env.INNGEST_DEV === '1',
});
