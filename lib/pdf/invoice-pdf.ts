import { invoiceHasOfflineQueueEntry, loadInvoiceForPdf, saveInvoicePdfPath } from './invoice-data';
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
  | { success: true; pdf: Buffer; filename: string }
  | {
      success: false;
      error: string;
      code?: 'KSEF_NOT_VERIFIED' | 'NOT_FOUND' | 'FORBIDDEN' | 'OFFLINE_QR_UNAVAILABLE' | 'KSEF_QR_UNAVAILABLE';
    };

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
  const requiresOfflineQr = !data.ksefNumber && (
    !!data.offlineIdempotencyKey?.trim() ||
    data.ksefStatus === 'offline_queued' ||
    await invoiceHasOfflineQueueEntry(invoiceId, tenantId)
  );
  if (requiresOfflineQr) {
    return {
      success: false,
      code: 'OFFLINE_QR_UNAVAILABLE',
      error: 'PDF faktury offline przed nadaniem numeru KSeF wymaga dwóch kodów QR, w tym certyfikatu KSeF typu Offline. Wydanie PDF jest obecnie niedostępne.',
    };
  }

  const qrPayload = invoiceVerificationUrl({
    env: ksefEnvForQr(),
    sellerNip: data.sellerNip,
    issueDate: data.issueDate,
    sha256Hex: data.xmlSha256Hex,
  });
  // Faktura z numerem KSeF udostępniana poza systemem musi mieć KOD I.
  // Brak skrótu XML lub innych składników URL nie może zwrócić starego cache.
  if (data.ksefNumber && !qrPayload) {
    return {
      success: false,
      code: 'KSEF_QR_UNAVAILABLE',
      error: 'Nie można przygotować PDF faktury z numerem KSeF: brakuje danych do kodu weryfikacyjnego KOD I.',
    };
  }

  const filename = `Faktura_${sanitizeFilename(data.invoice.internalNumber)}.pdf`;
  const key = buildInvoicePdfKey(tenantId, invoiceId, data.issueDate);

  // Cache hit: PDF istnieje i jest świeższy niż ostatnia zmiana faktury.
  const cacheValid =
    data.pdfStoragePath === key &&
    isTenantStoragePath(data.pdfStoragePath, tenantId) &&
    data.pdfGeneratedAt &&
    (!data.updatedAt ||
      new Date(data.pdfGeneratedAt) >= new Date(data.updatedAt));

  if (cacheValid && data.pdfStoragePath) {
    try {
      if (await invoicePdfExists(data.pdfStoragePath)) {
        const cached = await downloadInvoicePdf(data.pdfStoragePath, tenantId);
        return { success: true, pdf: cached, filename };
      }
    } catch {
      // Cache miss / R2 error — spadamy do regeneracji poniżej.
    }
  }

  // Regeneracja.
  // KOD I wg specyfikacji MF: link weryfikacyjny z NIP-u, daty i SHA-256
  // pliku XML — nie sam numer KSeF. Szkic bez pliku → bez kodu.
  const pdf = await renderInvoicePdf(data.invoice, {
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

  return { success: true, pdf, filename };
}

/** Usuwa znaki niedozwolone w nazwie pliku (np. `/` z `FV 2026/04/001`). */
function sanitizeFilename(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80);
}
