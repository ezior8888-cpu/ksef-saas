import { Inngest, eventType, staticSchema } from 'inngest';
import { z } from 'zod';

import type { Invoice } from '@/types/invoice';
import type { CorrectionInvoiceData, AdvanceInvoiceData, FinalInvoiceData } from '@/types/invoice-types';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';

import { zodEvent } from './event-schema';

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

/**
 * Schemat Zod dla `invoice/submit.requested`.
 *
 * Walidacja runtime'owa: chroni przed zniekształconym payloadem (np. brak
 * NIP-u przy replay'u eventu ze starego kodu) — handler robi `.parse()`
 * na wejściu i bezpiecznie kończy się NonRetriableError, zamiast łamać się
 * w środku transakcji KSeF.
 *
 * Domena (`invoice`, `correctionData`, ...) idzie przez `z.custom<T>()` —
 * top-level kształt wymuszamy, ale głębokie pola walidują formularze i
 * generatory XML (RHF + Zod + libxmljs2 XSD).
 */
const InvoiceSubmitRequestedSchema = z.object({
  tenantId: z.string().uuid('tenantId musi być UUID'),
  invoiceId: z.string().uuid('invoiceId musi być UUID'),
  invoice: z.custom<Invoice>(
    (v): v is Invoice => v != null && typeof v === 'object' && !Array.isArray(v),
    { message: 'invoice musi być obiektem domeny' },
  ),
  /** NIP tenanta (klucz rate-limitera + kontekst sesji KSeF). */
  nip: z.string().regex(/^\d{10}$/, 'NIP musi mieć dokładnie 10 cyfr'),
  /** Gdy ustawione, generujemy XML z `generateCorrectionInvoiceXml`. */
  correctionData: z.custom<CorrectionInvoiceData>().optional(),
  /** Faktura ZAL w FA(3). */
  advanceData: z.custom<AdvanceInvoiceData>().optional(),
  /** ROZ — nagłówek bez listy zaliczek; użyj razem z `finalAdvanceSettlementRows`. */
  finalData: z.custom<FinalInvoiceData>().optional(),
  finalAdvanceSettlementRows: z
    .array(z.custom<AdvanceInvoiceSettlementRow>())
    .optional(),
  fromOfflineQueue: z.boolean().optional(),
  offlineQueueId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

/** Użytkownik kliknął "Wyślij fakturę do KSeF" w UI. */
export const invoiceSubmitRequested = zodEvent(
  'invoice/submit.requested',
  InvoiceSubmitRequestedSchema,
);

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

/**
 * Zaplanuj pobranie UPO dla faktury po akceptacji w KSeF.
 *
 * `nip` jest tu po to, by `downloadUpoJob` mógł użyć
 * `concurrency: { key: 'event.data.nip', limit: 3 }` — globalna kolejka
 * Inngest na klucz NIP zapewnia, że jeden tenant nie zalewa KSeF API
 * (multi-instance Vercel ten warunek omija per-NIP rate-limitera w pamięci).
 */
export const invoiceUpoRequested = eventType('invoice/upo.requested', {
  schema: staticSchema<{
    invoiceId: string;
    tenantId: string;
    /** NIP tenanta — klucz concurrency w `downloadUpoJob`. */
    nip: string;
    ksefNumber: string;
  }>(),
});

/**
 * Żądanie Magicznego Importu historii faktur z KSeF (wydane lub odebrane).
 *
 * `nip` jest tu po to, by `magicImportKsefJob` mógł użyć
 * `concurrency: { key: 'event.data.nip', limit: 3 }`.
 */
export const importKsefHistoryRequested = eventType('import/ksef-history.requested', {
  schema: staticSchema<{
    importJobId: string;
    tenantId: string;
    /** NIP tenanta — klucz concurrency w `magicImportKsefJob`. */
    nip: string;
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

/** Serwer: batch walidacji NIP/VAT kontrahentów (Biała Lista / VIES + cache). */
export const validationBulkContractorsRequested = eventType(
  'validation/bulk-contractors.requested',
  {
    schema: staticSchema<{
      tenantId: string;
      contractorIds: string[];
      forceRefresh: boolean;
      triggeredBy: string;
    }>(),
  },
);

/** Zaplanuj wysyłkę przypomnienia (Po `reminder-scheduler` — job `send-reminder`). */
export const remindersSendRequested = eventType('reminders/send.requested', {
  schema: staticSchema<{
    reminderId: string;
  }>(),
});

/**
 * Zaksięgowano płatność przy fakturze — konsumenci (np. „Wkurzacz”) mogą
 * anulować oczekujące przypomnienia.
 */
export const invoicePaymentReceived = eventType('invoice/payment.received', {
  schema: staticSchema<{
    invoiceId: string;
  }>(),
});

/** Uruchom generowanie pliku eksportu (worker Inngest). */
export const exportsGenerateRequested = eventType('exports/generate.requested', {
  schema: staticSchema<{
    exportJobId: string;
  }>(),
});

/** Paczka dla księgowego — generowanie ZIP / e‑mail Co‑Pilot. */
export const exportsCoPilotSendPackage = eventType(
  'exports/co-pilot.send-package',
  {
    schema: staticSchema<{
      tenantId: string;
      periodStart: string;
      periodEnd: string;
      formats: string[];
      accountantEmail: string;
      accountantName: string | null;
      manual: boolean;
    }>(),
  },
);

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
