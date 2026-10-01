import { invoiceHasOfflineQueueEntry, loadInvoiceForPdf, saveInvoicePdfPath, type InvoicePdfData } from './invoice-data';
import {
  buildInvoicePdfKey,
  downloadInvoicePdf,
  invoicePdfExists,
  uploadInvoicePdf,
} from './pdf-storage';
import { renderInvoicePdf } from './invoice-renderer';
import { invoiceVerificationUrl, ksefEnvForQr, qrLabel } from '@/lib/ksef/qr-verification';
import { isTenantStoragePath } from '@/lib/storage/tenant-path';

export type GenerateInvoicePdfResult =
  | { success: true; pdf: Buffer; filename: string; qrStateKey: string }
  | {
      success: false;
      error: string;
      code?: 'KSEF_NOT_VERIFIED' | 'NOT_FOUND' | 'FORBIDDEN' | 'OFFLINE_QR_UNAVAILABLE' | 'KSEF_QR_UNAVAILABLE' | 'PDF_STATE_CHANGED';
    };

type PdfFailure = Extract<GenerateInvoicePdfResult, { success: false }>;

function pdfStateChanged(): PdfFailure {
  return {
    success: false,
    code: 'PDF_STATE_CHANGED',
    error: 'Stan faktury zmienił się podczas przygotowania PDF. Spróbuj ponownie.',
  };
}

async function checkQrAvailability(
  data: InvoicePdfData,
  invoiceId: string,
  tenantId: string,
  knownQueueEntry?: boolean,
): Promise<{ qrPayload: string | null; failure: PdfFailure | null }> {
  const requiresOfflineQr = !data.ksefNumber && (
    !!data.offlineIdempotencyKey?.trim() ||
    data.ksefStatus === 'offline_queued' ||
    (knownQueueEntry ?? await invoiceHasOfflineQueueEntry(invoiceId, tenantId))
  );
  if (requiresOfflineQr) {
    return {
      qrPayload: null,
      failure: {
        success: false,
        code: 'OFFLINE_QR_UNAVAILABLE',
        error: 'PDF faktury offline przed nadaniem numeru KSeF wymaga dwóch kodów QR, w tym certyfikatu KSeF typu Offline. Wydanie PDF jest obecnie niedostępne.',
      },
    };
  }

  const qrPayload = invoiceVerificationUrl({
    env: ksefEnvForQr(),
    sellerNip: data.sellerNip,
    issueDate: data.issueDate,
    sha256Hex: data.xmlSha256Hex,
  });
  if (data.ksefNumber && !qrPayload) {
    return {
      qrPayload: null,
      failure: {
        success: false,
        code: 'KSEF_QR_UNAVAILABLE',
        error: 'Nie można przygotować PDF faktury z numerem KSeF: brakuje danych do kodu weryfikacyjnego KOD I.',
      },
    };
  }
  return { qrPayload, failure: null };
}

/** Sprawdza stan bezpośrednio przed przekazaniem PDF odbiorcy lub wysyłką. */
export async function verifyInvoicePdfDeliveryState(
  invoiceId: string,
  tenantId: string,
  expectedQrStateKey: string,
): Promise<PdfFailure | null> {
  // Nowa ścieżka Offline24 zapisuje znacznik na fakturze przed insertem kolejki.
  // Odczyt kolejki musi więc poprzedzać ostatni odczyt faktury: dzięki temu
  // częściowy zapis między tymi zapytaniami będzie widoczny w drugim odczycie.
  const queueEntry = await invoiceHasOfflineQueueEntry(invoiceId, tenantId);
  const current = await loadInvoiceForPdf(invoiceId, tenantId);
  if (!current) return { success: false, code: 'NOT_FOUND', error: 'Faktura nie istnieje.' };
  if (current.tenantId !== tenantId) return { success: false, code: 'FORBIDDEN', error: 'Brak dostępu do tej faktury.' };
  const currentQr = await checkQrAvailability(current, invoiceId, tenantId, queueEntry);
  if (currentQr.failure) return currentQr.failure;
  const currentKey = buildInvoicePdfKey(
    tenantId, invoiceId, current.issueDate, currentQr.qrPayload, current.ksefNumber,
  );
  return currentKey === expectedQrStateKey ? null : pdfStateChanged();
}

/**
 * Generuje (lub zwraca z cache R2) PDF faktury (Faza 33 Krok 4).
 *
 * Flow:
 *   1. Bramka KSeF verification (jak w stubie Fazy 9).
 *   2. Load + mapowanie DB → `Invoice`.
 *   3. Ownership: faktura musi należeć do `tenantId`.
 *   4. Cache: jeśli `pdf_generated_at >= updated_at` i obiekt jest w R2 —
 *      zwróć go bez regeneracji.
 *   5. W przeciwnym razie: render (pdfkit) → upload R2 → zapis ścieżki.
 *
 * Watermark „WERSJA TESTOWA" gdy `KSEF_ENV=test`. QR = KOD I (link weryfikacyjny
 * MF z NIP-u, daty i SHA-256 pliku XML), pod nim numer KSeF albo „OFFLINE”;
 * szkic bez pliku XML — bez kodu.
 */
export async function generateInvoicePdf(
  invoiceId: string,
  tenantId: string,
): Promise<GenerateInvoicePdfResult> {
  // BUG-011 (audyt przedlaunchowy): USUNIĘTO bramkę `requireKsefVerification`.
  // Generowanie PDF to czysto LOKALNE renderowanie wizualizacji faktury — nie
  // dotyka KSeF, nie wysyła nic do MF. Wymaganie certyfikatu KSeF do pobrania
  // PDF (nawet szkicu) blokowało podstawową funkcję: użytkownik bez certyfikatu
  // testowego nie mógł pobrać żadnego PDF (zwracało 403 KSEF_NOT_VERIFIED).
  // Renderer obsługuje brak numeru KSeF (`ksefNumber ?? null`) i dokleja
  // watermark „WERSJA TESTOWA". Ownership (tenant) nadal sprawdzamy niżej.
  const data = await loadInvoiceForPdf(invoiceId, tenantId);
  if (!data) {
    return { success: false, error: 'Faktura nie istnieje.', code: 'NOT_FOUND' };
  }
  if (data.tenantId !== tenantId) {
    return {
      success: false,
      error: 'Brak dostępu do tej faktury.',
      code: 'FORBIDDEN',
    };
  }

  // Stary/przerwany zapis mógł zostawić kolejkę bez znacznika na fakturze.
  // Przed numerem KSeF również taki przypadek wymaga KODU II. Sprawdzamy
  // kolejkę przed cache, a błąd odczytu przerywa wydanie PDF.
  const { qrPayload, failure } = await checkQrAvailability(data, invoiceId, tenantId);
  if (failure) return failure;
  // Faktura z numerem KSeF udostępniana poza systemem musi mieć KOD I.
  // Brak skrótu XML lub innych składników URL nie może zwrócić starego cache.
  const filename = `Faktura_${sanitizeFilename(data.invoice.internalNumber)}.pdf`;
  const key = buildInvoicePdfKey(tenantId, invoiceId, data.issueDate, qrPayload, data.ksefNumber);

  // Cache hit: PDF istnieje i jest świeższy niż ostatnia zmiana faktury.
  const cacheValid =
    data.pdfStoragePath === key &&
    isTenantStoragePath(data.pdfStoragePath, tenantId) &&
    data.pdfGeneratedAt &&
    (!data.updatedAt ||
      new Date(data.pdfGeneratedAt) >= new Date(data.updatedAt));

  let pdf: Buffer | null = null;
  if (cacheValid && data.pdfStoragePath) {
    try {
      if (await invoicePdfExists(data.pdfStoragePath)) {
        pdf = await downloadInvoicePdf(data.pdfStoragePath, tenantId);
      }
    } catch {
      // Cache miss / R2 error — spadamy do regeneracji poniżej.
    }
  }

  // Regeneracja.
  // KOD I wg specyfikacji MF: link weryfikacyjny z NIP-u, daty i SHA-256
  // pliku XML — nie sam numer KSeF. Szkic bez pliku → bez kodu.
  if (!pdf) {
    pdf = await renderInvoicePdf(data.invoice, {
      ksefNumber: data.ksefNumber,
      qrPayload,
      qrLabel: qrLabel(data.ksefNumber),
      correctedInvoice: data.correctedInvoice,
      testWatermark: (process.env.KSEF_ENV ?? 'test') === 'test',
    });

    try {
      await uploadInvoicePdf(key, pdf);
      await saveInvoicePdfPath(invoiceId, key);
    } catch (err) {
      // Upload do cache nieudany — i tak zwracamy świeży PDF userowi.
      console.error('[invoice-pdf] cache upload failed:', err);
    }
  }

  // Render, odczyt cache i upload są asynchroniczne. W tym czasie faktura mogła
  // wejść do Offline24 lub otrzymać numer KSeF. Przed wydaniem ponownie
  // sprawdzamy trwały znacznik, kolejkę i dokładny stan kodu QR.
  const finalFailure = await verifyInvoicePdfDeliveryState(invoiceId, tenantId, key);
  if (finalFailure) return finalFailure;

  return { success: true, pdf, filename, qrStateKey: key };
}

/** Usuwa znaki niedozwolone w nazwie pliku (np. `/` z `FV 2026/04/001`). */
function sanitizeFilename(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80);
}
