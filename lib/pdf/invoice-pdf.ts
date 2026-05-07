import {
  KsefNotVerifiedError,
  requireKsefVerification,
} from '@/lib/auth/ksef-verification-guard';

export type GenerateInvoicePdfResult =
  | { success: true; pdfBase64: string; filename: string }
  | { success: false; error: string; code?: 'KSEF_NOT_VERIFIED' };

/**
 * Bramka przed generowaniem oficjalnego PDF faktury (dane firmy / FA).
 * Pełny renderer FA(3) → PDF nie jest jeszcze podłączony — po pozytywnej
 * weryfikacji KSeF zwracany jest jawny komunikat „nie zaimplementowano”.
 */
export async function generateInvoicePdf(
  invoiceId: string,
  tenantId: string,
): Promise<GenerateInvoicePdfResult> {
  void invoiceId;

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

  return {
    success: false,
    error:
      'Eksport PDF faktury (FA) nie jest jeszcze zaimplementowany. Użyj pobrania XML lub UPO z widoku faktury.',
  };
}
