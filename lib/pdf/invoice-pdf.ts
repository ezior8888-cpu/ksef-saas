import {
  KsefNotVerifiedError,
  requireKsefVerification,
} from '@/lib/auth/ksef-verification-guard';
import { loadInvoiceForPdf, saveInvoicePdfPath } from './invoice-data';
import {
  buildInvoicePdfKey,
  downloadInvoicePdf,
  invoicePdfExists,
  uploadInvoicePdf,
} from './pdf-storage';
import { renderInvoicePdf } from './invoice-renderer';

export type GenerateInvoicePdfResult =
  | { success: true; pdf: Buffer; filename: string }
  | {
      success: false;
      error: string;
      code?: 'KSEF_NOT_VERIFIED' | 'NOT_FOUND' | 'FORBIDDEN';
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
 * Watermark „WERSJA TESTOWA" gdy `KSEF_ENV=test`. QR koduje numer KSeF
 * (gdy faktura zaakceptowana).
 */
export async function generateInvoicePdf(
  invoiceId: string,
  tenantId: string,
): Promise<GenerateInvoicePdfResult> {
  try {
    await requireKsefVerification(tenantId);
  } catch (e) {
    if (e instanceof KsefNotVerifiedError) {
      return {
        success: false,
        error: 'Weryfikacja KSeF wymagana przed generowaniem faktur.',
        code: 'KSEF_NOT_VERIFIED',
      };
    }
    throw e;
  }

  const data = await loadInvoiceForPdf(invoiceId);
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

  const filename = `Faktura_${sanitizeFilename(data.invoice.internalNumber)}.pdf`;

  // Cache hit: PDF istnieje i jest świeższy niż ostatnia zmiana faktury.
  const cacheValid =
    data.pdfStoragePath &&
    data.pdfGeneratedAt &&
    (!data.updatedAt ||
      new Date(data.pdfGeneratedAt) >= new Date(data.updatedAt));

  if (cacheValid && data.pdfStoragePath) {
    try {
      if (await invoicePdfExists(data.pdfStoragePath)) {
        const cached = await downloadInvoicePdf(data.pdfStoragePath);
        return { success: true, pdf: cached, filename };
      }
    } catch {
      // Cache miss / R2 error — spadamy do regeneracji poniżej.
    }
  }

  // Regeneracja.
  const pdf = await renderInvoicePdf(data.invoice, {
    ksefNumber: data.ksefNumber,
    qrPayload: data.ksefNumber ?? null,
    testWatermark: (process.env.KSEF_ENV ?? 'test') === 'test',
  });

  const key = buildInvoicePdfKey(tenantId, invoiceId, data.issueDate);
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
