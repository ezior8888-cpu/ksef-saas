import {
  downloadFromR2,
  r2ObjectExists,
  uploadToR2,
} from '@/lib/storage/r2';

/**
 * Storage PDF faktur w R2 (Faza 33 Krok 3).
 *
 * Reużywa generycznych helperów z `lib/storage/r2.ts` (ten sam bucket
 * co XML faktur). Konwencja klucza spójna z XML — `.pdf` zamiast `.xml`:
 *   {tenantId}/{YYYY}/{MM}/{invoiceId}.pdf
 */

function parseYearMonth(issueDate: string): { year: string; month: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new Error(
      `Invalid issueDate "${issueDate}": expected YYYY-MM-DD`,
    );
  }
  const [year, month] = issueDate.split('-');
  return { year: year!, month: month! };
}

/** Buduje klucz R2 dla PDF faktury. */
export function buildInvoicePdfKey(
  tenantId: string,
  invoiceId: string,
  issueDate: string,
): string {
  const { year, month } = parseYearMonth(issueDate);
  return `${tenantId}/${year}/${month}/${invoiceId}.pdf`;
}

export async function uploadInvoicePdf(
  key: string,
  pdf: Buffer,
): Promise<void> {
  await uploadToR2(key, pdf, 'application/pdf');
}

export async function downloadInvoicePdf(key: string): Promise<Buffer> {
  return downloadFromR2(key);
}

export async function invoicePdfExists(key: string): Promise<boolean> {
  return r2ObjectExists(key);
}
